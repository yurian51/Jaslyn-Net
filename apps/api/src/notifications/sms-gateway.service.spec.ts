import { BadRequestException } from '@nestjs/common';
import { SmsGatewayService } from './sms-gateway.service';

describe('SmsGatewayService', () => {
  const configFor = (values: Record<string, string>) => ({ get: (key: string) => values[key] }) as any;
  const beem = {
    status: () => ({ provider: 'beem', enabled: false, configured: false, credentialsPresent: false, senderIdConfigured: false, mode: 'test' }),
    send: jest.fn(),
  } as any;

  beforeEach(() => jest.clearAllMocks());

  it('fails closed when a tenant has no provider config and legacy fallback is off', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) } as any;
    const gateway = new SmsGatewayService(db, configFor({ SMS_ENABLED: 'true', SMS_ALLOW_LEGACY_GLOBAL_PROVIDER: 'false' }), beem);
    await expect(gateway.status('tenant-a')).resolves.toMatchObject({
      provider: 'none', configured: false, enabled: false, source: 'tenant-unconfigured',
    });
  });

  it('rejects a custom endpoint whose hostname is not deployment-approved', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) } as any;
    const gateway = new SmsGatewayService(db, configFor({
      SMS_CUSTOM_ALLOWED_HOSTS: 'sms-approved.example',
      JASLYN_SMS_CREDENTIAL_ENCRYPTION_KEY: 'a'.repeat(64),
    }), beem);
    await expect(gateway.save('tenant-a', {
      provider: 'custom_rest', endpoint: 'https://attacker.example/send', senderId: 'TEST',
      authType: 'none', enabled: false,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects non-HTTPS endpoints even when the hostname is approved', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) } as any;
    const gateway = new SmsGatewayService(db, configFor({
      SMS_CUSTOM_ALLOWED_HOSTS: 'sms-approved.example',
      JASLYN_SMS_CREDENTIAL_ENCRYPTION_KEY: 'a'.repeat(64),
    }), beem);
    await expect(gateway.save('tenant-a', {
      provider: 'custom_rest', endpoint: 'http://sms-approved.example/send', senderId: 'TEST',
      authType: 'none', enabled: false,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('never exposes stored credential material in the settings response', async () => {
    const db = {
      query: jest.fn().mockResolvedValue({ rows: [{
        tenant_id: 'tenant-a', provider: 'custom_rest', endpoint: 'https://sms-approved.example/send',
        sender_id: 'TEST', auth_type: 'bearer', credentials_ciphertext: 'encrypted-only',
        api_key_header: 'X-API-Key', recipient_field: 'to', message_field: 'message', sender_field: 'sender',
        response_id_field: 'messageId', response_success_field: null, response_success_value: 'true', enabled: false,
      }] }),
    } as any;
    const gateway = new SmsGatewayService(db, configFor({}), beem);
    const settings = await gateway.getSettings('tenant-a');
    expect(settings).toMatchObject({ provider: 'custom_rest', hasCredentials: true });
    expect(JSON.stringify(settings)).not.toContain('encrypted-only');
  });
});
