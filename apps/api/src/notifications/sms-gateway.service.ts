import { BadRequestException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { BeemSmsProvider, SmsDelivery } from './sms.provider';

export type SmsProviderKind = 'beem' | 'custom_rest';
export type SmsAuthType = 'none' | 'bearer' | 'api_key' | 'basic';
export type SmsProviderInput = {
  provider: SmsProviderKind; endpoint?: string; senderId: string; authType?: SmsAuthType;
  apiKey?: string; apiSecret?: string; apiKeyHeader?: string; recipientField?: string;
  messageField?: string; senderField?: string; responseIdField?: string;
  responseSuccessField?: string; responseSuccessValue?: string; enabled?: boolean;
};
type StoredConfig = {
  tenant_id: string; provider: SmsProviderKind; endpoint: string | null; sender_id: string;
  auth_type: SmsAuthType; credentials_ciphertext: string | null; api_key_header: string | null;
  recipient_field: string; message_field: string; sender_field: string; response_id_field: string;
  response_success_field: string | null; response_success_value: string | null; enabled: boolean;
};
const FIELD = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const FIELD_PATH = /^[A-Za-z][A-Za-z0-9_-]{0,63}(\.[A-Za-z][A-Za-z0-9_-]{0,63}){0,5}$/;

@Injectable()
export class SmsGatewayService {
  constructor(@Inject(PG_POOL) private readonly db: Pool, private readonly config: ConfigService, private readonly beem: BeemSmsProvider) {}

  private encryptionKey(): Buffer {
    const value = this.config.get<string>('JASLYN_SMS_CREDENTIAL_ENCRYPTION_KEY') || '';
    if (!/^[a-fA-F0-9]{64}$/.test(value)) throw new ServiceUnavailableException('SMS credential encryption key is not configured');
    return Buffer.from(value, 'hex');
  }

  private encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join('.');
  }

  private decrypt(value: string): string {
    const [ivText, tagText, ciphertextText] = value.split('.');
    if (!ivText || !tagText || !ciphertextText) throw new Error('Invalid encrypted SMS credentials');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), Buffer.from(ivText, 'base64'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextText, 'base64')), decipher.final()]).toString('utf8');
  }

  private validateEndpoint(raw: string): URL {
    let url: URL;
    try { url = new URL(raw); } catch { throw new BadRequestException('Provider endpoint must be a valid HTTPS URL'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new BadRequestException('Provider endpoint must use HTTPS and cannot include credentials or a fragment');
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.test') || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.startsWith('[')) {
      throw new BadRequestException('Provider endpoint host is not allowed');
    }
    const allowlist = (this.config.get<string>('SMS_CUSTOM_ALLOWED_HOSTS') || '').split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);
    if (!allowlist.includes(hostname)) throw new BadRequestException('Provider host must first be approved in SMS_CUSTOM_ALLOWED_HOSTS by a system operator');
    return url;
  }

  private validateFieldPath(value: string | undefined, fallback: string, label: string): string {
    const field = (value || fallback).trim();
    if (!FIELD_PATH.test(field) || field.split('.').some((part) => ['__proto__', 'constructor', 'prototype'].includes(part))) {
      throw new BadRequestException(label + ' is not a supported field path');
    }
    return field;
  }

  async save(tenantId: string, input: SmsProviderInput) {
    if (!['beem', 'custom_rest'].includes(input.provider)) throw new BadRequestException('Unsupported SMS provider type');
    const senderId = (input.senderId || '').trim();
    if (!/^[A-Za-z0-9_-]{2,16}$/.test(senderId)) throw new BadRequestException('Sender ID must contain 2–16 letters, numbers, underscores or hyphens');
    const authType = input.authType || (input.provider === 'beem' ? 'basic' : 'bearer');
    if (!['none', 'bearer', 'api_key', 'basic'].includes(authType)) throw new BadRequestException('Unsupported authentication type');
    let endpoint: string | null = null;
    if (input.provider === 'custom_rest') endpoint = this.validateEndpoint(input.endpoint || '').toString();
    else if (input.endpoint?.trim()) endpoint = this.validateEndpoint(input.endpoint).toString();

    const current = await this.db.query<StoredConfig>('SELECT * FROM sms_provider_configs WHERE tenant_id=$1', [tenantId]);
    const previous = current.rows[0];
    // Never carry credentials across provider changes; a new provider must receive its own credentials.
    let credentials = previous?.provider === input.provider && previous.credentials_ciphertext
      ? JSON.parse(this.decrypt(previous.credentials_ciphertext)) as { apiKey?: string; apiSecret?: string }
      : {};
    if (input.apiKey?.trim()) credentials.apiKey = input.apiKey.trim();
    if (input.apiSecret?.trim()) credentials.apiSecret = input.apiSecret.trim();
    if (authType !== 'none' && !credentials.apiKey) throw new BadRequestException('API credential is required for the selected authentication type');
    if (authType === 'basic' && !credentials.apiSecret) throw new BadRequestException('API secret is required for Basic authentication');
    if (authType === 'none') credentials = {};
    const encrypted = Object.keys(credentials).length ? this.encrypt(JSON.stringify(credentials)) : null;
    const preserveExistingCredentials = previous?.provider === input.provider && authType !== 'none' && !input.apiKey?.trim() && !input.apiSecret?.trim();
    const apiKeyHeader = (input.apiKeyHeader || 'X-API-Key').trim();
    if (authType === 'api_key' && !FIELD.test(apiKeyHeader)) throw new BadRequestException('API key header must be a simple HTTP header name');
    const recipientField = this.validateFieldPath(input.recipientField, 'to', 'Recipient field');
    const messageField = this.validateFieldPath(input.messageField, 'message', 'Message field');
    const senderField = this.validateFieldPath(input.senderField, 'sender', 'Sender field');
    const responseIdField = this.validateFieldPath(input.responseIdField, 'messageId', 'Response message ID field');
    const responseSuccessField = input.responseSuccessField?.trim() ? this.validateFieldPath(input.responseSuccessField, 'success', 'Response success field') : null;
    const responseSuccessValue = input.responseSuccessValue?.trim() || 'true';
    const result = await this.db.query(
      `INSERT INTO sms_provider_configs
        (tenant_id,provider,endpoint,sender_id,auth_type,credentials_ciphertext,api_key_header,recipient_field,message_field,sender_field,response_id_field,response_success_field,response_success_value,enabled,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())
       ON CONFLICT (tenant_id) DO UPDATE SET provider=EXCLUDED.provider,endpoint=EXCLUDED.endpoint,sender_id=EXCLUDED.sender_id,auth_type=EXCLUDED.auth_type,
         credentials_ciphertext=CASE WHEN $15::boolean THEN sms_provider_configs.credentials_ciphertext ELSE EXCLUDED.credentials_ciphertext END,api_key_header=EXCLUDED.api_key_header,
         recipient_field=EXCLUDED.recipient_field,message_field=EXCLUDED.message_field,sender_field=EXCLUDED.sender_field,
         response_id_field=EXCLUDED.response_id_field,response_success_field=EXCLUDED.response_success_field,response_success_value=EXCLUDED.response_success_value,
         enabled=EXCLUDED.enabled,updated_at=now()
       RETURNING provider,endpoint,sender_id AS "senderId",auth_type AS "authType",(credentials_ciphertext IS NOT NULL) AS "hasCredentials",enabled,updated_at AS "updatedAt"`,
      [tenantId, input.provider, endpoint, senderId, authType, encrypted, apiKeyHeader, recipientField, messageField, senderField, responseIdField, responseSuccessField, responseSuccessValue, input.enabled === true, preserveExistingCredentials],
    );
    return result.rows[0];
  }

  async status(tenantId: string) {
    const result = await this.db.query<StoredConfig>('SELECT * FROM sms_provider_configs WHERE tenant_id=$1', [tenantId]);
    const row = result.rows[0];
    if (!row) return { ...this.beem.status(), source: 'environment' as const };
    const globallyEnabled = this.config.get<string>('SMS_ENABLED') === 'true';
    const hasCredentials = Boolean(row.credentials_ciphertext) || row.auth_type === 'none';
    const encryptionReady = /^[a-fA-F0-9]{64}$/.test(this.config.get<string>('JASLYN_SMS_CREDENTIAL_ENCRYPTION_KEY') || '');
    return {
      provider: row.provider, enabled: globallyEnabled && row.enabled,
      configured: globallyEnabled && row.enabled && hasCredentials && encryptionReady && Boolean(row.sender_id) && (row.provider === 'beem' || Boolean(row.endpoint)),
      credentialsPresent: Boolean(row.credentials_ciphertext), senderIdConfigured: Boolean(row.sender_id),
      senderId: row.sender_id, hasCredentials: Boolean(row.credentials_ciphertext),
      mode: this.config.get<string>('NODE_ENV') === 'production' ? 'production' : 'non-production', source: 'tenant' as const,
    };
  }

  async getSettings(tenantId: string) {
    const result = await this.db.query<StoredConfig>('SELECT * FROM sms_provider_configs WHERE tenant_id=$1', [tenantId]);
    const row = result.rows[0];
    if (!row) return { configured: false, provider: 'beem', enabled: false, senderId: '', endpoint: '', authType: 'basic', hasCredentials: false };
    return {
      configured: true, provider: row.provider, enabled: row.enabled, senderId: row.sender_id, endpoint: row.endpoint || '',
      authType: row.auth_type, apiKeyHeader: row.api_key_header || 'X-API-Key', recipientField: row.recipient_field,
      messageField: row.message_field, senderField: row.sender_field, responseIdField: row.response_id_field,
      responseSuccessField: row.response_success_field || '', responseSuccessValue: row.response_success_value || 'true',
      hasCredentials: Boolean(row.credentials_ciphertext),
    };
  }

  async send(tenantId: string, to: string, message: string, idempotencyKey: string): Promise<SmsDelivery> {
    const state = await this.status(tenantId);
    if (!state.configured) throw new ServiceUnavailableException('SMS is disabled or provider settings are incomplete for this tenant');
    const result = await this.db.query<StoredConfig>('SELECT * FROM sms_provider_configs WHERE tenant_id=$1', [tenantId]);
    const row = result.rows[0];
    if (!row) return this.beem.send(to, message, idempotencyKey);
    if (!/^255\d{9}$/.test(to)) throw new BadRequestException('SMS recipient must be a normalized Tanzania mobile number');
    if (!message.trim() || message.length > 1600) throw new BadRequestException('SMS message must contain 1–1600 characters');
    const credentials = row.credentials_ciphertext ? JSON.parse(this.decrypt(row.credentials_ciphertext)) as { apiKey?: string; apiSecret?: string } : {};
    const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey.slice(0, 180) };
    if (row.auth_type === 'bearer') headers.Authorization = `Bearer ${credentials.apiKey}`;
    if (row.auth_type === 'api_key') headers[row.api_key_header || 'X-API-Key'] = credentials.apiKey || '';
    if (row.auth_type === 'basic') headers.Authorization = `Basic ${Buffer.from(`${credentials.apiKey || ''}:${credentials.apiSecret || ''}`).toString('base64')}`;
    const endpoint = row.provider === 'beem' ? (row.endpoint || 'https://apisms.beem.africa/v1/send') : this.validateEndpoint(row.endpoint || '').toString();
    if (row.provider === 'beem') {
      const body = { source_addr: row.sender_id, encoding: 0, schedule_time: '', message, recipients: [{ recipient_id: idempotencyKey.slice(0, 32), dest_addr: to }] };
      const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(15000) });
      const data = await response.json().catch(() => null) as Record<string, unknown> | null;
      if (!response.ok) throw new Error(`SMS provider request failed with HTTP ${response.status}`);
      const id = String(data?.request_id ?? data?.requestId ?? data?.message_id ?? '');
      if (data?.successful === false || (typeof data?.code === 'number' && data.code >= 400)) throw new Error('SMS provider rejected the request');
      if (!id && data?.successful !== true && data?.code !== 100) throw new Error('SMS provider returned an unrecognized acknowledgement');
      return { providerMessageId: id || idempotencyKey, accepted: true };
    }
    const body: Record<string, unknown> = {};
    this.setPath(body, row.recipient_field, to); this.setPath(body, row.message_field, message); this.setPath(body, row.sender_field, row.sender_id);
    const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(15000) });
    const data = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) throw new Error(`SMS provider request failed with HTTP ${response.status}`);
    const providerMessageId = String(this.getPath(data, row.response_id_field) ?? '');
    if (row.response_success_field && String(this.getPath(data, row.response_success_field)).toLowerCase() !== String(row.response_success_value || 'true').toLowerCase()) {
      throw new Error('SMS provider rejected the request');
    }
    if (!providerMessageId) throw new Error('SMS provider response did not include the configured message ID field');
    return { providerMessageId, accepted: true };
  }

  private setPath(target: Record<string, unknown>, path: string, value: unknown) {
    const parts = path.split('.'); let current = target;
    for (const part of parts.slice(0, -1)) { if (!current[part] || typeof current[part] !== 'object' || Array.isArray(current[part])) current[part] = {}; current = current[part] as Record<string, unknown>; }
    current[parts[parts.length - 1]] = value;
  }
  private getPath(target: Record<string, unknown> | null, path: string): unknown {
    if (!target) return undefined;
    return path.split('.').reduce<unknown>((current, part) => current && typeof current === 'object' && !Array.isArray(current) ? (current as Record<string, unknown>)[part] : undefined, target);
  }
}
