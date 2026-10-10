import { ServiceUnavailableException } from '@nestjs/common';
import { BeemSmsProvider } from './sms.provider';

describe('BeemSmsProvider', () => {
  const configFor = (values: Record<string, string>) => ({
    get: (key: string) => values[key],
  }) as any;

  it('fails closed unless explicitly enabled and all credentials exist', async () => {
    const provider = new BeemSmsProvider(configFor({
      SMS_PROVIDER: 'beem',
      SMS_ENABLED: 'false',
      BEEM_API_KEY: 'key',
      BEEM_SECRET_KEY: 'secret',
      BEEM_SENDER_ID: 'JASLYNNET',
    }));
    expect(provider.status().configured).toBe(false);
    await expect(provider.send('255712345678', 'test', 'dedupe-1'))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects malformed Tanzanian phone numbers before network calls', async () => {
    const provider = new BeemSmsProvider(configFor({
      SMS_PROVIDER: 'beem', SMS_ENABLED: 'true',
      BEEM_API_KEY: 'key', BEEM_SECRET_KEY: 'secret', BEEM_SENDER_ID: 'JASLYNNET',
    }));
    await expect(provider.send('+255712345678', 'test', 'dedupe-1'))
      .rejects.toThrow('normalized Tanzania mobile number');
  });

  it('reports provider status without exposing credentials', () => {
    const provider = new BeemSmsProvider(configFor({
      SMS_PROVIDER: 'beem', SMS_ENABLED: 'true',
      BEEM_API_KEY: 'secret-key-value', BEEM_SECRET_KEY: 'secret-secret-value',
      BEEM_SENDER_ID: 'JASLYNNET',
    }));
    expect(provider.status()).toMatchObject({ configured: true, credentialsPresent: true, senderIdConfigured: true });
    expect(JSON.stringify(provider.status())).not.toContain('secret-key-value');
    expect(JSON.stringify(provider.status())).not.toContain('secret-secret-value');
  });
});
