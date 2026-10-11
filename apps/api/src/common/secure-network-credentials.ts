import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';

const LEGACY_VERSION = 1;
const ENVELOPE_VERSION = 2;
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

type Keyring = { activeId: string; keys: Map<string, Buffer> };

export class SecureNetworkCredentials {
  constructor(private readonly config: ConfigService) {}

  private keyring(): Keyring {
    const keys = new Map<string, Buffer>();
    const rawRing = this.config.get<string>('JASLYN_NETWORK_CREDENTIAL_KEYRING')?.trim();
    if (rawRing) {
      for (const item of rawRing.split(',')) {
        const separator = item.indexOf(':');
        if (separator < 1) throw new Error('JASLYN_NETWORK_CREDENTIAL_KEYRING entries must use id:64-hex format');
        const id = item.slice(0, separator).trim();
        const encoded = item.slice(separator + 1).trim();
        if (!/^[a-zA-Z0-9_-]{1,32}$/.test(id) || !/^[a-f0-9]{64}$/i.test(encoded)) {
          throw new Error('JASLYN_NETWORK_CREDENTIAL_KEYRING entries must use id:64-hex format');
        }
        if (keys.has(id)) throw new Error('Duplicate key id in JASLYN_NETWORK_CREDENTIAL_KEYRING');
        keys.set(id, Buffer.from(encoded, 'hex'));
      }
    }

    const legacy = this.config.get<string>('JASLYN_NETWORK_CREDENTIAL_KEY')?.trim();
    if (legacy && /^[a-f0-9]{64}$/i.test(legacy) && !keys.has('legacy')) {
      keys.set('legacy', Buffer.from(legacy, 'hex'));
      if (!keys.has('1')) keys.set('1', Buffer.from(legacy, 'hex'));
    }

    const activeId = this.config.get<string>('JASLYN_NETWORK_CREDENTIAL_ACTIVE_KEY_ID')?.trim()
      || (keys.has('1') ? '1' : keys.keys().next().value);
    if (!activeId || !keys.has(activeId)) {
      throw new Error('Configure JASLYN_NETWORK_CREDENTIAL_KEY or a keyring with a valid active key id');
    }
    return { activeId, keys };
  }

  encrypt(credentials: NetworkCredentials): string {
    const { activeId, keys } = this.keyring();
    const key = keys.get(activeId)!;
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const plaintext = Buffer.from(JSON.stringify(credentials), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${ENVELOPE_VERSION}.${activeId}.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
  }

  decrypt(payload: string): NetworkCredentials {
    const parts = payload.split('.');
    const version = Number(parts[0]);
    let keyId: string;
    let ivText: string;
    let tagText: string;
    let cipherText: string;

    if (version === LEGACY_VERSION && parts.length === 4) {
      keyId = '1';
      [, ivText, tagText, cipherText] = parts;
    } else if (version === ENVELOPE_VERSION && parts.length === 5) {
      [, keyId, ivText, tagText, cipherText] = parts;
    } else {
      throw new Error('Invalid encrypted network credentials');
    }

    if (!keyId || !ivText || !tagText || !cipherText) throw new Error('Invalid encrypted network credentials');
    try {
      const { keys } = this.keyring();
      const key = keys.get(keyId);
      if (!key) throw new Error('Encryption key is unavailable');
      const iv = Buffer.from(ivText, 'base64url');
      const tag = Buffer.from(tagText, 'base64url');
      const ciphertext = Buffer.from(cipherText, 'base64url');
      if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || ciphertext.length === 0) throw new Error('Invalid encrypted network credentials');
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
      const value = JSON.parse(plaintext) as unknown;
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid credential payload');
      return value as NetworkCredentials;
    } catch {
      throw new Error('Unable to decrypt network device credentials');
    }
  }

  activeKeyId(): string {
    return this.keyring().activeId;
  }
}
