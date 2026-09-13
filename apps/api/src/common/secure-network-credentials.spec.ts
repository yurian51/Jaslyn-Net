import { ConfigService } from '@nestjs/config';
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
});
