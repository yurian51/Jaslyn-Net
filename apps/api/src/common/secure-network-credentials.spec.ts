import { ConfigService } from '@nestjs/config';
import { createCipheriv } from 'node:crypto';
import { SecureNetworkCredentials } from './secure-network-credentials';

describe('SecureNetworkCredentials', () => {
  const config = new ConfigService({ JASLYN_NETWORK_CREDENTIAL_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' });

  it('round-trips credentials without exposing plaintext in ciphertext', () => {
    const service = new SecureNetworkCredentials(config);
    const credentials = { username: 'router-admin', password: 'secret-password', apiKey: 'api-key' };
    const encrypted = service.encrypt(credentials);
    expect(encrypted).not.toContain('router-admin');
    expect(encrypted).not.toContain('secret-password');
    expect(service.decrypt(encrypted)).toEqual(credentials);
  });

  it('rejects tampered ciphertext', () => {
    const service = new SecureNetworkCredentials(config);
    const encrypted = service.encrypt({ apiKey: 'abc' });
    const parts = encrypted.split('.');
    parts[3] = `${parts[3]}x`;
    expect(() => service.decrypt(parts.join('.'))).toThrow('Unable to decrypt network device credentials');
  });

  it('requires a valid 32-byte hexadecimal key', () => {
    const service = new SecureNetworkCredentials(new ConfigService({ JASLYN_NETWORK_CREDENTIAL_KEY: 'short' }));
    expect(() => service.encrypt({ apiKey: 'abc' })).toThrow('must be a 32-byte hexadecimal key');
  });
  it('decrypts legacy payloads and re-encrypts with the active keyring key', () => {
    const oldKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const newKey = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    const iv = Buffer.alloc(12, 7);
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(oldKey, 'hex'), iv);
    const plaintext = Buffer.from(JSON.stringify({ username: 'legacy-router', password: 'legacy-secret' }), 'utf8');
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const legacyPayload = `1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
    const service = new SecureNetworkCredentials(new ConfigService({
      JASLYN_NETWORK_CREDENTIAL_KEYRING: `1:${oldKey},2:${newKey}`,
      JASLYN_NETWORK_CREDENTIAL_ACTIVE_KEY_ID: '2',
    }));

    expect(service.decrypt(legacyPayload)).toEqual({ username: 'legacy-router', password: 'legacy-secret' });
    const rotated = service.encrypt(service.decrypt(legacyPayload));
    expect(rotated.startsWith('2.2.')).toBe(true);
    expect(service.decrypt(rotated)).toEqual({ username: 'legacy-router', password: 'legacy-secret' });
  });

  it('requires the active key ID to exist in a configured keyring', () => {
    const service = new SecureNetworkCredentials(new ConfigService({
      JASLYN_NETWORK_CREDENTIAL_KEYRING: '1:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      JASLYN_NETWORK_CREDENTIAL_ACTIVE_KEY_ID: 'missing',
    }));
    expect(() => service.encrypt({ apiKey: 'abc' })).toThrow('valid active key id');
  });

});
