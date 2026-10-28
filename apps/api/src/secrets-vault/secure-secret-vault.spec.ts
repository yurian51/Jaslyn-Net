import { SecureSecretVault } from './secure-secret-vault';

describe('SecureSecretVault',()=>{
  const keyA='a'.repeat(64);
  const keyB='b'.repeat(64);
  const config=(values:Record<string,string>)=>({get:(name:string)=>values[name]});
  it('encrypts with AES-GCM and can decrypt old ciphertext while a new key is active',()=>{
    const oldVault=new SecureSecretVault(config({JASLYN_SECRET_VAULT_KEYRING:JSON.stringify({'key-a':keyA}),JASLYN_SECRET_VAULT_ACTIVE_KEY_ID:'key-a'}) as any);
    const oldEnvelope=oldVault.encrypt('provider-secret').envelope;
    const rotatedVault=new SecureSecretVault(config({JASLYN_SECRET_VAULT_KEYRING:JSON.stringify({'key-a':keyA,'key-b':keyB}),JASLYN_SECRET_VAULT_ACTIVE_KEY_ID:'key-b'}) as any);
    expect(rotatedVault.decrypt(oldEnvelope)).toBe('provider-secret');
    const newEnvelope=rotatedVault.encrypt(rotatedVault.decrypt(oldEnvelope));
    expect(newEnvelope.keyId).toBe('key-b');
    expect(rotatedVault.decrypt(newEnvelope.envelope)).toBe('provider-secret');
    expect(newEnvelope.envelope).not.toContain('provider-secret');
  });
  it('fails closed when an active key is missing',()=>{
    const vault=new SecureSecretVault(config({JASLYN_SECRET_VAULT_KEYRING:JSON.stringify({'key-a':keyA,'key-b':keyB})}) as any);
    expect(()=>vault.encrypt('secret')).toThrow('Active secret-vault key is not present');
  });
  it('rejects tampered ciphertext',()=>{
    const vault=new SecureSecretVault(config({JASLYN_SECRET_VAULT_KEYRING:JSON.stringify({'key-a':keyA}),JASLYN_SECRET_VAULT_ACTIVE_KEY_ID:'key-a'}) as any);
    const parts=vault.encrypt('secret-value').envelope.split('.');
    parts[3]=Buffer.from('invalid-auth-tag').toString('base64url');
    expect(()=>vault.decrypt(parts.join('.'))).toThrow('Secret decryption failed');
  });
});
