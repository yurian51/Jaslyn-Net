import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { SignJWT } from 'jose';
import { LoginThrottleService } from './login-throttle.service';
import { PG_POOL } from '../database/database.module';
import { LoginDto, RegisterDto } from './auth.dto';
import { AuthenticatedRequest } from './auth.guard';
import { AuditService } from '../audit/audit.service';

const scrypt = promisify(scryptCallback);
const PASSWORD_KEY_LENGTH = 64;
const ISSUER = 'jaslyn-net';
const AUDIENCE = 'jaslyn-net-api';
const TERMS_VERSION = '2026-09-18';
const PRIVACY_VERSION = '2026-09-18';

interface UserTokenRecord { id: string; tenant_id: string; email: string; full_name: string; role: string; }
interface TenantTokenRecord { id: string; name: string; slug: string; status: string; currency: string; timezone: string; }

@Injectable()
export class AuthService {
  constructor(@Inject(PG_POOL) private readonly db: Pool, private readonly config: ConfigService, private readonly audit: AuditService, private readonly throttle?: LoginThrottleService) {}

  async register(input: RegisterDto, context: { ip?: string; userAgent?: string } = {}) {
    if (input.acceptTerms !== true || input.acceptPrivacy !== true) {
      throw new BadRequestException('Acceptance of the current Terms of Use and Privacy Notice is required');
    }
    const slug = this.slugify(input.businessName);
    const passwordHash = await this.hashPassword(input.password);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const tenant = await client.query<TenantTokenRecord>(
        'INSERT INTO tenants (name, slug, status) VALUES ($1, $2, $3) RETURNING id, name, slug, status, currency, timezone',
        [input.businessName.trim(), slug, 'TRIAL'],
      );
      const user = await client.query<UserTokenRecord>(
        'INSERT INTO users (tenant_id, email, password_hash, full_name, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, tenant_id, email, full_name, role',
        [tenant.rows[0].id, input.email.toLowerCase().trim(), passwordHash, input.fullName.trim(), 'OWNER'],
      );
      await client.query(
        `INSERT INTO legal_acceptances (tenant_id, user_id, document_type, document_version, ip_address, user_agent)
         VALUES ($1,$2,'TERMS_OF_USE',$3,$4,$5),($1,$2,'PRIVACY_NOTICE',$6,$4,$5)`,
        [tenant.rows[0].id, user.rows[0].id, TERMS_VERSION, context.ip ?? null, context.userAgent?.slice(0, 500) ?? null, PRIVACY_VERSION],
      );
      await client.query('COMMIT');
      return this.issueTokens(user.rows[0], tenant.rows[0], context);
    } catch (error) {
      await client.query('ROLLBACK');
      if (isUniqueViolation(error)) throw new ConflictException('Business slug or email already exists');
      throw error;
    } finally { client.release(); }
  }

  async acceptLegalDocument(user: NonNullable<AuthenticatedRequest['user']>, documentType: 'TERMS_OF_USE' | 'PRIVACY_NOTICE', context: { ip?: string; userAgent?: string | string[] } = {}) {
    const version = documentType === 'TERMS_OF_USE' ? TERMS_VERSION : documentType === 'PRIVACY_NOTICE' ? PRIVACY_VERSION : null;
    if (!version) throw new BadRequestException('Unsupported legal document');

    await this.db.query(
      `INSERT INTO legal_acceptances (tenant_id, user_id, document_type, document_version, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (tenant_id, user_id, document_type, document_version) DO NOTHING`,
      [user.tenantId, user.id, documentType, version, context.ip ?? null, Array.isArray(context.userAgent) ? (context.userAgent[0]?.slice(0, 500) ?? null) : (context.userAgent?.slice(0, 500) ?? null)],
    );
    return { documentType, documentVersion: version, accepted: true };
  }

  async getLegalAcceptanceStatus(user: NonNullable<AuthenticatedRequest['user']>) {
    const result = await this.db.query<{ document_type: 'TERMS_OF_USE' | 'PRIVACY_NOTICE'; document_version: string; accepted_at: string }>(
      `SELECT DISTINCT ON (document_type) document_type, document_version, accepted_at
       FROM legal_acceptances
       WHERE tenant_id = $1 AND user_id = $2
       ORDER BY document_type, accepted_at DESC`,
      [user.tenantId, user.id],
    );
    const current = { TERMS_OF_USE: TERMS_VERSION, PRIVACY_NOTICE: PRIVACY_VERSION };
    return {
      documents: Object.entries(current).map(([documentType, documentVersion]) => {
        const accepted = result.rows.find((row) => row.document_type === documentType);
        return {
          documentType,
          currentVersion: documentVersion,
          acceptedVersion: accepted?.document_version ?? null,
          acceptedAt: accepted?.accepted_at ?? null,
          current: accepted?.document_version === documentVersion,
        };
      }),
    };
  }

  async login(input: LoginDto, context: { ip?: string; userAgent?: string } = {}) {
    await this.throttle?.assertAllowed(input.email, context.ip);
    const result = await this.db.query<UserTokenRecord & { is_active: boolean; password_hash: string; tenant_name: string; tenant_slug: string; tenant_status: string; currency: string; timezone: string }>(
      `SELECT u.id, u.tenant_id, u.email, u.full_name, u.role, u.is_active, u.password_hash,
              t.name AS tenant_name, t.slug AS tenant_slug, t.status AS tenant_status, t.currency, t.timezone
       FROM users u JOIN tenants t ON t.id = u.tenant_id
       WHERE lower(u.email) = lower($1) LIMIT 1`, [input.email.trim()],
    );
    const user = result.rows[0];
    const reject = async (): Promise<never> => { await this.throttle?.recordFailure(input.email, context.ip); throw new UnauthorizedException('Invalid credentials'); };
    if (!user || !user.is_active || user.tenant_status === 'SUSPENDED' || user.tenant_status === 'ARCHIVED') return reject();
    if (!(await this.verifyPassword(input.password, user.password_hash))) return reject();
    await this.throttle?.recordSuccess(input.email, context.ip);
    return this.issueTokens(user, { id: user.tenant_id, name: user.tenant_name, slug: user.tenant_slug, status: user.tenant_status, currency: user.currency, timezone: user.timezone }, context);
  }


  async requestPasswordReset(email: string) {
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    const from = this.config.get<string>('EMAIL_FROM')?.trim();
    let appUrl = this.config.get<string>('APP_URL')?.trim() ?? '';
    while (appUrl.endsWith('/')) appUrl = appUrl.slice(0, -1);
    if (!apiKey || !from || !appUrl) {
      throw new ServiceUnavailableException('Password recovery email is not configured yet. Please contact the Jaslyn Net administrator.');
    }

    const genericResponse = {
      message: 'If an active account exists for that email, a password reset link will arrive shortly.',
    };
    const result = await this.db.query<{ id: string; tenant_id: string; email: string }>(
      `SELECT u.id, u.tenant_id, u.email
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE lower(u.email) = lower($1) AND u.is_active = true
         AND t.status NOT IN ('SUSPENDED', 'ARCHIVED')
       LIMIT 1`,
      [email.trim()],
    );
    const user = result.rows[0];
    if (!user) return genericResponse;

    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await this.db.query(
      `UPDATE password_reset_tokens SET used_at = now()
       WHERE tenant_id = $1 AND user_id = $2 AND used_at IS NULL`,
      [user.tenant_id, user.id],
    );
    await this.db.query(
      `INSERT INTO password_reset_tokens (tenant_id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + interval '30 minutes')`,
      [user.tenant_id, user.id, tokenHash],
    );

    const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [user.email],
          subject: 'Reset your Jaslyn Net password',
          text: `We received a request to reset your Jaslyn Net password. Open this link within 30 minutes: ${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
          html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172033"><h2>Reset your Jaslyn Net password</h2><p>We received a request to reset the password for your Jaslyn Net account.</p><p><a href="${resetUrl}" style="display:inline-block;padding:12px 18px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:6px">Reset password</a></p><p>This link expires in 30 minutes and can only be used once.</p><p>If you did not request this, you can safely ignore this email.</p></div>`,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        await this.db.query(
          `UPDATE password_reset_tokens SET used_at = now()
           WHERE token_hash = $1 AND used_at IS NULL`,
          [tokenHash],
        );
        console.error(`Password reset email delivery failed (HTTP ${response.status}). Check RESEND_API_KEY and EMAIL_FROM configuration.`);
      }
    } catch (error) {
      await this.db.query(
        `UPDATE password_reset_tokens SET used_at = now()
         WHERE token_hash = $1 AND used_at IS NULL`,
        [tokenHash],
      ).catch(() => undefined);
      console.error('Password reset email delivery failed. Check network access and Resend configuration.', error);
    }
    return genericResponse;
  }

  async resetPassword(token: string, password: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ id: string; tenant_id: string; user_id: string }>(
        `SELECT id, tenant_id, user_id
         FROM password_reset_tokens
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
         FOR UPDATE`,
        [tokenHash],
      );
      const reset = result.rows[0];
      if (!reset) throw new BadRequestException('This reset link is invalid or has expired. Request a new one.');

      const passwordHash = await this.hashPassword(password);
      const updated = await client.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2 AND tenant_id = $3 AND is_active = true RETURNING id',
        [passwordHash, reset.user_id, reset.tenant_id],
      );
      if (!updated.rowCount) throw new BadRequestException('This account is no longer active. Contact your administrator.');
      await client.query(
        `UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'PASSWORD_RESET'
         WHERE tenant_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
        [reset.tenant_id, reset.user_id],
      );
      await client.query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [reset.id]);
      await client.query('COMMIT');
      return { message: 'Your password has been reset. You can now sign in with your new password.' };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async issueTokens(user: UserTokenRecord, tenant: TenantTokenRecord, context: { ip?: string; userAgent?: string } = {}) {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be configured with at least 32 characters');
    const sessionId = randomUUID();
    await this.db.query(
      `INSERT INTO auth_sessions (id, tenant_id, user_id, user_agent, ip_address, expires_at)
       VALUES ($1,$2,$3,$4,$5,now()+interval '30 days')`,
      [sessionId, tenant.id, user.id, context.userAgent?.slice(0, 500) ?? null, context.ip ?? null],
    );
    const accessToken = await new SignJWT({ sub: user.id, sid: sessionId, tenantId: tenant.id, role: user.role, email: user.email })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setIssuer(ISSUER).setAudience(AUDIENCE).setJti(sessionId).setIssuedAt().setExpirationTime('15m').sign(new TextEncoder().encode(secret));
    return { accessToken, tokenType: 'Bearer', expiresIn: 900, session: { id: sessionId }, user: { id: user.id, tenantId: tenant.id, email: user.email, fullName: user.full_name, role: user.role }, tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, status: tenant.status, currency: tenant.currency, timezone: tenant.timezone } };
  }

  async listSessions(user: NonNullable<AuthenticatedRequest['user']>) {
    const result = await this.db.query(
      `SELECT id, user_agent AS "userAgent", ip_address::text AS "ipAddress",
              created_at AS "createdAt", last_seen_at AS "lastSeenAt", expires_at AS "expiresAt",
              revoked_at AS "revokedAt", (id=$3::uuid) AS "isCurrent",
              (revoked_at IS NULL AND expires_at>now()) AS "isActive"
       FROM auth_sessions
       WHERE tenant_id=$1 AND user_id=$2
       ORDER BY created_at DESC LIMIT 100`,
      [user.tenantId, user.id, user.sessionId],
    );
    return { data: result.rows, count: result.rowCount ?? 0 };
  }

  async revokeSession(user: NonNullable<AuthenticatedRequest['user']>, sessionId: string, context: { ip?: string; userAgent?: string | string[]; requestId?: string } = {}) {
    const result = await this.db.query(
      `UPDATE auth_sessions SET revoked_at=now(), revoke_reason='USER_REQUEST'
       WHERE tenant_id=$1 AND user_id=$2 AND id=$3 AND revoked_at IS NULL
       RETURNING id`,
      [user.tenantId, user.id, sessionId],
    );
    if (!result.rowCount) throw new BadRequestException('Session was not found or has already been revoked');
    await this.audit.record(user.tenantId, 'SESSION_REVOKED', 'auth_session', sessionId, { reason: 'USER_REQUEST' }, {
      userId: user.id, requestId: context.requestId, ipAddress: context.ip,
      userAgent: Array.isArray(context.userAgent) ? context.userAgent[0] : context.userAgent,
    });
    return { revoked: true, sessionId };
  }

  async revokeOtherSessions(user: NonNullable<AuthenticatedRequest['user']>, context: { ip?: string; userAgent?: string | string[]; requestId?: string } = {}) {
    const result = await this.db.query(
      `UPDATE auth_sessions SET revoked_at=now(), revoke_reason='REVOKE_OTHERS'
       WHERE tenant_id=$1 AND user_id=$2 AND id<>$3::uuid AND revoked_at IS NULL
         AND expires_at>now()
       RETURNING id`,
      [user.tenantId, user.id, user.sessionId],
    );
    await this.audit.record(user.tenantId, 'SESSIONS_REVOKED_OTHERS', 'auth_session', user.sessionId, { revokedCount: result.rowCount ?? 0 }, {
      userId: user.id, requestId: context.requestId, ipAddress: context.ip,
      userAgent: Array.isArray(context.userAgent) ? context.userAgent[0] : context.userAgent,
    });
    return { revokedCount: result.rowCount ?? 0, currentSessionPreserved: true };
  }

  async getCurrentUser(user: NonNullable<AuthenticatedRequest['user']>) {
    const result = await this.db.query(
      `SELECT u.id, u.email, u.full_name AS "fullName", u.role,
              t.id AS "tenantId", t.name AS "tenantName", t.slug AS "tenantSlug",
              t.timezone, t.currency
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1 AND u.tenant_id = $2 AND u.is_active = true
       LIMIT 1`,
      [user.id, user.tenantId],
    );
    if (!result.rowCount) throw new UnauthorizedException('Active user profile not found');
    return { user: result.rows[0] };
  }

  private async hashPassword(password: string) { const salt = randomBytes(16); const derived = (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer; return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`; }

  private async verifyPassword(password: string, stored: string) {
    try {
      const [scheme, saltEncoded, hashEncoded] = stored.split('$');
      if (scheme !== 'scrypt' || !saltEncoded || !hashEncoded) return false;
      const salt = Buffer.from(saltEncoded, 'base64url'); const expected = Buffer.from(hashEncoded, 'base64url');
      if (salt.length < 16 || expected.length !== PASSWORD_KEY_LENGTH) return false;
      const actual = (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;
      return timingSafeEqual(expected, actual);
    } catch { return false; }
  }

  private slugify(value: string) { const base = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70); return base || `business-${randomBytes(4).toString('hex')}`; }
}

function isUniqueViolation(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === '23505'; }
