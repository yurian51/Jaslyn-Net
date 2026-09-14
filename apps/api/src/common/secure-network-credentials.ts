import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface NetworkCredentials {
  apiKey?: string;
  username?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
}

export class SecureNetworkCredentials {
  constructor(private readonly config: ConfigService) {}

  private key(): Buffer {
    const raw = this.config.get<string>('JASLYN_NETWORK_CREDENTIAL_KEY');
    if (!raw || !/^[a-f0-9]{64}$/i.test(raw)) {
      throw new Error('JASLYN_NETWORK_CREDENTIAL_KEY must be a 32-byte hexadecimal key');
    }
    return Buffer.from(raw, 'hex');
  }

  encrypt(credentials: NetworkCredentials): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const plaintext = Buffer.from(JSON.stringify(credentials), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${VERSION}.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
  }

  decrypt(payload: string): NetworkCredentials {
    const [version, ivText, tagText, cipherText] = payload.split('.');
    if (Number(version) !== VERSION || !ivText || !tagText || !cipherText) throw new Error('Invalid encrypted network credentials');
    try {
      const iv = Buffer.from(ivText, 'base64url');
      const tag = Buffer.from(tagText, 'base64url');
      const ciphertext = Buffer.from(cipherText, 'base64url');
      if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error('Invalid encrypted network credentials');
      const decipher = createDecipheriv('aes-256-gcm', this.key(), iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
      const value = JSON.parse(plaintext) as unknown;
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid credential payload');
      return value as NetworkCredentials;
    } catch {
      throw new Error('Unable to decrypt network device credentials');
    }
  }
}
