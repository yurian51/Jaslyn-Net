import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { VouchersService } from '../vouchers/vouchers.service';
import { PublicVoucherRedemptionDto } from './public-voucher-redemption.dto';

@Injectable()
export class CaptivePortalService {
  constructor(@Inject(PG_POOL) private readonly db: Pool, private readonly vouchers: VouchersService) {}

  async getPublicPortal(slugInput: string) {
    const slug = slugInput.trim().toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) throw new NotFoundException('Portal not found');
    const tenant = await this.db.query(
      `SELECT t.id, t.name, t.slug, t.currency, t.timezone, s.enabled,
              COALESCE(NULLIF(s.title,''), t.name) AS title,
              COALESCE(s.welcome_message, 'Choose a Wi-Fi package or use a voucher to connect.') AS "welcomeMessage",
              s.terms_text AS "termsText", s.support_phone AS "supportPhone", s.support_email AS "supportEmail"
       FROM tenants t LEFT JOIN captive_portal_settings s ON s.tenant_id=t.id
       WHERE t.slug=$1 AND t.status='ACTIVE' LIMIT 1`,
      [slug],
    );
    if (!tenant.rowCount || tenant.rows[0].enabled !== true) throw new NotFoundException('Captive portal is not available');
    const packages = await this.db.query(
      `SELECT id, name, tagline, price, currency, duration_seconds AS "durationSeconds",
              data_limit_bytes AS "dataLimitBytes", download_bps AS "downloadBps", upload_bps AS "uploadBps",
              is_featured AS "isFeatured"
       FROM packages WHERE tenant_id=$1 AND is_active=true AND show_on_portal=true
       ORDER BY is_featured DESC, price ASC, name ASC LIMIT 100`,
      [tenant.rows[0].id],
    );
    return { portal: { name: tenant.rows[0].title, slug: tenant.rows[0].slug, currency: tenant.rows[0].currency,
      welcomeMessage: tenant.rows[0].welcomeMessage, termsText: tenant.rows[0].termsText,
      supportPhone: tenant.rows[0].supportPhone, supportEmail: tenant.rows[0].supportEmail },
      packages: packages.rows };
  }

  async redeemPublicVoucher(slugInput: string, input: PublicVoucherRedemptionDto, clientIp: string) {
    const slug = slugInput.trim().toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) throw new NotFoundException('Portal not found');
    let phone = input.phone.trim().replace(/[\s().-]/g, '');
    if (/^0\d{9}$/.test(phone)) phone = `+255${phone.slice(1)}`;
    else if (/^255\d{9}$/.test(phone)) phone = `+${phone}`;
    if (!/^\+?[1-9]\d{6,14}$/.test(phone)) throw new BadRequestException('Enter a valid phone number including country code when needed');
    const tenant = await this.db.query(
      `SELECT t.id FROM tenants t JOIN captive_portal_settings s ON s.tenant_id=t.id
       WHERE t.slug=$1 AND t.status='ACTIVE' AND s.enabled=true LIMIT 1`,
      [slug],
    );
    if (!tenant.rowCount) throw new NotFoundException('Captive portal is not available');
    const tenantId = String(tenant.rows[0].id);
    const fingerprint = createHash('sha256').update(`${tenantId}:${clientIp || 'unknown'}`).digest('hex');
    const attempt = await this.db.query<{ attemptCount: number; blockedUntil: Date | null }>(
      `INSERT INTO captive_portal_voucher_attempts(tenant_id,client_fingerprint,window_started_at,attempt_count)
       VALUES($1,$2,now(),1)
       ON CONFLICT(tenant_id,client_fingerprint) DO UPDATE SET
         window_started_at=CASE WHEN captive_portal_voucher_attempts.window_started_at <= now()-interval '15 minutes' THEN now() ELSE captive_portal_voucher_attempts.window_started_at END,
         attempt_count=CASE WHEN captive_portal_voucher_attempts.window_started_at <= now()-interval '15 minutes' THEN 1 ELSE captive_portal_voucher_attempts.attempt_count+1 END,
         blocked_until=CASE WHEN captive_portal_voucher_attempts.window_started_at <= now()-interval '15 minutes' THEN NULL
           WHEN captive_portal_voucher_attempts.attempt_count+1 >= 10 THEN now()+interval '15 minutes'
           ELSE captive_portal_voucher_attempts.blocked_until END,
         updated_at=now()
       RETURNING attempt_count AS "attemptCount",blocked_until AS "blockedUntil"`,
      [tenantId, fingerprint],
    );
    if (attempt.rows[0]?.attemptCount >= 10 || (attempt.rows[0]?.blockedUntil && new Date(attempt.rows[0].blockedUntil).getTime() > Date.now())) {
      throw new HttpException('Too many voucher attempts. Wait 15 minutes and try again.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const customerResult = await this.db.query<{ id: string }>(
      `SELECT id FROM customers WHERE tenant_id=$1 AND phone=$2 AND is_active=true ORDER BY created_at ASC LIMIT 1`,
      [tenantId, phone],
    );
    let customerId = customerResult.rows[0]?.id;
    if (!customerId) {
      const username = `portal-${randomBytes(12).toString('hex')}`;
      const created = await this.db.query<{ id: string }>(
        `INSERT INTO customers(tenant_id,full_name,phone,username,is_active)
         VALUES($1,$2,$3,$4,true) RETURNING id`,
        [tenantId, input.fullName.trim(), phone, username],
      );
      customerId = created.rows[0]?.id;
    }
    if (!customerId) throw new BadRequestException('Could not create a customer profile for voucher redemption');
    const result = await this.vouchers.redeem(tenantId, input.code, { customerId });
    return { ...result, message: 'Voucher accepted. Network access is being provisioned; wait for your device to connect.' };
  }

  async getSettings(tenantId: string) {
    const result = await this.db.query(`SELECT enabled,title,welcome_message AS "welcomeMessage",terms_text AS "termsText",support_phone AS "supportPhone",support_email AS "supportEmail",updated_at AS "updatedAt" FROM captive_portal_settings WHERE tenant_id=$1 LIMIT 1`, [tenantId]);
    return result.rows[0] ?? { enabled: false, title: null, welcomeMessage: null, termsText: 'By connecting, you agree to the network usage policy.', supportPhone: null, supportEmail: null, updatedAt: null };
  }

  async updateSettings(tenantId: string, actorId: string, input: {
    enabled: boolean; title?: string; welcomeMessage?: string; termsText: string;
    supportPhone?: string; supportEmail?: string;
  }) {
    if (input.title && input.title.trim().length > 120) throw new BadRequestException('Portal title is too long');
    if (!input.termsText.trim() || input.termsText.length > 10000) throw new BadRequestException('Portal terms are required and must be under 10,000 characters');
    const result = await this.db.query(
      `INSERT INTO captive_portal_settings(tenant_id,enabled,title,welcome_message,terms_text,support_phone,support_email,updated_by,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())
       ON CONFLICT(tenant_id) DO UPDATE SET enabled=EXCLUDED.enabled,title=EXCLUDED.title,
         welcome_message=EXCLUDED.welcome_message,terms_text=EXCLUDED.terms_text,
         support_phone=EXCLUDED.support_phone,support_email=EXCLUDED.support_email,
         updated_by=EXCLUDED.updated_by,updated_at=now()
       RETURNING enabled,title,welcome_message AS "welcomeMessage",terms_text AS "termsText",
         support_phone AS "supportPhone",support_email AS "supportEmail",updated_at AS "updatedAt"`,
      [tenantId,input.enabled,input.title?.trim()||null,input.welcomeMessage?.trim()||null,input.termsText.trim(),input.supportPhone?.trim()||null,input.supportEmail?.trim()||null,actorId],
    );
    return result.rows[0];
  }
}
