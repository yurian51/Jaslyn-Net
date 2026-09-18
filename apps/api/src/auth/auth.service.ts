import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { SignJWT } from 'jose';
import { PG_POOL } from '../database/database.module';
import { LoginDto, RegisterDto } from './auth.dto';
import { AuthenticatedRequest } from './auth.guard';

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
  constructor(@Inject(PG_POOL) private readonly db: Pool, private readonly config: ConfigService) {}

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
      return this.issueTokens(user.rows[0], tenant.rows[0]);
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
    const current = { TERMS_OF_USE, PRIVACY_NOTICE };
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

  async login(input: LoginDto) {
    const result = await this.db.query<UserTokenRecord & { is_active: boolean; password_hash: string; tenant_name: string; tenant_slug: string; tenant_status: string; currency: string; timezone: string }>(
      `SELECT u.id, u.tenant_id, u.email, u.full_name, u.role, u.is_active, u.password_hash,
              t.name AS tenant_name, t.slug AS tenant_slug, t.status AS tenant_status, t.currency, t.timezone
       FROM users u JOIN tenants t ON t.id = u.tenant_id
       WHERE lower(u.email) = lower($1) LIMIT 1`, [input.email.trim()],
    );
    const user = result.rows[0];
    if (!user || !user.is_active || user.tenant_status === 'SUSPENDED' || user.tenant_status === 'ARCHIVED') throw new UnauthorizedException('Invalid credentials');
    if (!(await this.verifyPassword(input.password, user.password_hash))) throw new UnauthorizedException('Invalid credentials');
    return this.issueTokens(user, { id: user.tenant_id, name: user.tenant_name, slug: user.tenant_slug, status: user.tenant_status, currency: user.currency, timezone: user.timezone });
  }

  private async issueTokens(user: UserTokenRecord, tenant: TenantTokenRecord) {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be configured with at least 32 characters');
    const accessToken = await new SignJWT({ sub: user.id, tenantId: tenant.id, role: user.role, email: user.email })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setIssuer(ISSUER).setAudience(AUDIENCE).setIssuedAt().setExpirationTime('15m').sign(new TextEncoder().encode(secret));
    return { accessToken, tokenType: 'Bearer', expiresIn: 900, user: { id: user.id, tenantId: tenant.id, email: user.email, fullName: user.full_name, role: user.role }, tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, status: tenant.status, currency: tenant.currency, timezone: tenant.timezone } };
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
