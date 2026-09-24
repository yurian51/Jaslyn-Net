import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PG_POOL } from '../database/database.module';
import { Pool } from 'pg';

type UpesiPayConfig = {
  credentialsRef?: string;
  merchantId?: string;
  customTag?: string;
  apiBaseUrl?: string;
};

@Injectable()
export class UpesiPayService {
  private readonly defaultBaseUrl = 'https://upesipay.com/api/v2';

  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly config: ConfigService,
  ) {}

  private async getConfig(tenantId: string): Promise<UpesiPayConfig & { token: string }> {
    const result = await this.db.query(
      `SELECT credentials_ref AS "credentialsRef", metadata
         FROM payment_provider_configs
        WHERE tenant_id=$1 AND provider='upesipay' AND is_active=true
        LIMIT 1`,
      [tenantId],
    );
    if (!result.rowCount) throw new ConflictException('UpesiPay is not configured for this organization');
    const metadata = (result.rows[0]?.metadata ?? {}) as UpesiPayConfig;
    const credentialsRef = metadata.credentialsRef ?? result.rows[0]?.credentialsRef;
    const token = credentialsRef ? this.config.get<string>(credentialsRef) : undefined;
    if (!token) throw new UnauthorizedException('UpesiPay authentication token is not configured');
    return { ...metadata, token };
  }

  private async request<T>(tenantId: string, path: string, init: RequestInit = {}): Promise<T> {
    const cfg = await this.getConfig(tenantId);
    const base = cfg.apiBaseUrl?.trim() || this.defaultBaseUrl;
    const url = new URL(path, base.endsWith('/') ? base : `${base}/`);
    if (url.protocol !== 'https:' || url.hostname !== 'upesipay.com') {
      throw new ConflictException('UpesiPay API base URL must remain on https://upesipay.com');
    }

    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Basic ${cfg.token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.text();
    let parsed: unknown = {};
    try { parsed = body ? JSON.parse(body) : {}; } catch { parsed = { raw: body }; }
    if (!response.ok) throw new ConflictException(`UpesiPay request failed with HTTP ${response.status}`);
    return parsed as T;
  }

  async getPaymentChannels(tenantId: string) {
    return this.request(tenantId, '/payment_channels/');
  }

  async getBankPaybills(tenantId: string) {
    return this.request(tenantId, '/bank_paybills/');
  }

  async topUpServiceWallet(tenantId: string, amount: number, phoneNumber: string) {
    if (!Number.isInteger(amount) || amount <= 0) throw new ConflictException('Top-up amount must be a positive integer');
    if (!/^\+?[0-9]{9,15}$/.test(phoneNumber.trim())) throw new ConflictException('Invalid phone number');
    return this.request(tenantId, '/topup/', {
      method: 'POST',
      body: JSON.stringify({ amount, phone_number: phoneNumber.trim() }),
    });
  }

  async merchantLink(tenantId: string) {
    const cfg = await this.getConfig(tenantId);
    const tag = cfg.customTag?.trim();
    const merchantId = cfg.merchantId?.trim();
    if (!tag && !merchantId) throw new ConflictException('Configure UpesiPay merchantId or customTag');
    return {
      url: `https://upesipay.com/m/${encodeURIComponent(tag || merchantId!)}`,
      mode: tag ? 'custom_tag' : 'merchant_id',
    };
  }

  async recordCallback(tenantId: string, payload: Record<string, unknown>) {
    const merchantRequestId = typeof payload.merchant_request_id === 'string' ? payload.merchant_request_id : null;
    const checkoutRequestId = typeof payload.checkout_request_id === 'string' ? payload.checkout_request_id : null;
    const referenceId = typeof payload.reference_id === 'string' ? payload.reference_id : null;
    const rawStatus = typeof payload.status === 'string' ? payload.status.toLowerCase() : 'unknown';
    const status = ['success','failed','cancelled','timeout'].includes(rawStatus) ? rawStatus : 'unknown';
    const eventId = referenceId || checkoutRequestId || merchantRequestId;
    if (!eventId) throw new ConflictException('UpesiPay callback has no usable event identifier');

    const result = await this.db.query(
      `INSERT INTO upesipay_callback_events
        (tenant_id, provider_event_id, merchant_request_id, checkout_request_id, reference_id, status, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (tenant_id, provider_event_id)
       DO UPDATE SET payload=EXCLUDED.payload
       RETURNING id, provider_event_id AS "providerEventId", status, verification_status AS "verificationStatus"`,
      [tenantId, eventId, merchantRequestId, checkoutRequestId, referenceId, status, payload],
    );
    return { accepted: true, requiresVerification: true, data: result.rows[0] };
  }
}
