import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type SmsDelivery = {
  providerMessageId: string;
  accepted: boolean;
};

@Injectable()
export class BeemSmsProvider {
  constructor(private readonly config: ConfigService) {}

  status() {
    const enabled = this.config.get<string>('SMS_ENABLED') === 'true';
    const provider = (this.config.get<string>('SMS_PROVIDER') || 'beem').toLowerCase();
    const credentialsPresent = Boolean(
      this.config.get<string>('BEEM_API_KEY')?.trim() &&
      this.config.get<string>('BEEM_SECRET_KEY')?.trim() &&
      this.config.get<string>('BEEM_SENDER_ID')?.trim(),
    );
    return {
      provider,
      enabled,
      configured: provider === 'beem' && enabled && credentialsPresent,
      credentialsPresent,
      senderIdConfigured: Boolean(this.config.get<string>('BEEM_SENDER_ID')?.trim()),
      mode: this.config.get<string>('NODE_ENV') === 'production' ? 'production' : 'non-production',
    };
  }

  async send(to: string, message: string, idempotencyKey: string): Promise<SmsDelivery> {
    const status = this.status();
    if (!status.configured) throw new ServiceUnavailableException('SMS delivery is disabled or provider credentials are incomplete');
    if (!/^255\d{9}$/.test(to)) throw new Error('SMS recipient must be a normalized Tanzania mobile number (255XXXXXXXXX)');
    if (!message.trim() || message.length > 1600) throw new Error('SMS message must contain 1-1600 characters');

    const apiKey = this.config.get<string>('BEEM_API_KEY')!;
    const secretKey = this.config.get<string>('BEEM_SECRET_KEY')!;
    const senderId = this.config.get<string>('BEEM_SENDER_ID')!;
    const endpoint = this.config.get<string>('BEEM_SMS_ENDPOINT') || 'https://apisms.beem.africa/v1/send';
    let endpointUrl: URL;
    try { endpointUrl = new URL(endpoint); } catch { throw new ServiceUnavailableException('Beem SMS endpoint is invalid'); }
    if (endpointUrl.protocol !== 'https:' || endpointUrl.username || endpointUrl.password || endpointUrl.search || endpointUrl.hash || (endpointUrl.port && endpointUrl.port !== '443')) {
      throw new ServiceUnavailableException('Beem SMS endpoint must use HTTPS on port 443 without URL credentials, query parameters or fragments');
    }
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:${secretKey}`).toString('base64')}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        source_addr: senderId,
        encoding: 0,
        schedule_time: '',
        message,
        recipients: [{ recipient_id: idempotencyKey.slice(0, 32), dest_addr: to }],
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      // Do not include provider response bodies: they can contain recipient details or credentials.
      throw new Error(`Beem SMS request failed with HTTP ${response.status}`);
    }
    const providerMessageId = String(body?.request_id ?? body?.requestId ?? body?.message_id ?? '');
    if (body?.successful === false || (typeof body?.code === 'number' && body.code >= 400)) {
      throw new Error('Beem rejected the SMS request');
    }
    if (!providerMessageId && body?.successful !== true && body?.code !== 100) {
      throw new Error('Beem returned an unrecognized SMS acknowledgement');
    }
    return { providerMessageId: providerMessageId || idempotencyKey, accepted: true };
  }
}
