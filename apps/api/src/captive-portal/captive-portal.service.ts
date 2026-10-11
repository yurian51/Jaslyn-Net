import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

@Injectable()
export class CaptivePortalService {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

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
