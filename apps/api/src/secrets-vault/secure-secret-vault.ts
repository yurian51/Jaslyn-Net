import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';

export class SecureSecretVault {
  constructor(private readonly config:ConfigService){}
  private keys(){
    const keys=new Map<string,Buffer>();
    const raw=this.config.get<string>('JASLYN_SECRET_VAULT_KEYRING');
    if(raw){
      let parsed:Record<string,string>;
      try{parsed=JSON.parse(raw) as Record<string,string>;}catch{throw new Error('JASLYN_SECRET_VAULT_KEYRING must be a JSON object of key IDs to 64-character hex keys');}
      for(const [id,value] of Object.entries(parsed)){
        if(!/^[a-zA-Z0-9_-]{1,32}$/.test(id)||typeof value!=='string'||!/^[a-fA-F0-9]{64}$/.test(value))throw new Error('Each secret-vault key must have a valid ID and a 32-byte hexadecimal value');
        keys.set(id,Buffer.from(value,'hex'));
      }
    }
    const legacy=this.config.get<string>('JASLYN_SECRET_VAULT_KEY');
    if(legacy){if(!/^[a-fA-F0-9]{64}$/.test(legacy))throw new Error('JASLYN_SECRET_VAULT_KEY must be a 32-byte hexadecimal key');if(!keys.has('legacy'))keys.set('legacy',Buffer.from(legacy,'hex'));}
    return keys;
  }
  activeKeyId(){
    const keys=this.keys();const id=this.config.get<string>('JASLYN_SECRET_VAULT_ACTIVE_KEY_ID')||(keys.has('legacy')?'legacy':keys.keys().next().value);
    if(!id||!keys.has(id))throw new Error('Active secret-vault key is not present in JASLYN_SECRET_VAULT_KEYRING');
    return id;
  }
  encrypt(value:string){
    if(typeof value!=='string'||value.length===0)throw new Error('Secret value must not be empty');
    const id=this.activeKeyId();const key=this.keys().get(id)!;const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key,iv);
    const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
    return {envelope:['2',id,iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),ciphertext.toString('base64url')].join('.'),keyId:id};
  }
  decrypt(envelope:string){
    const parts=envelope.split('.');
    if(parts.length!==5||parts[0]!=='2')throw new Error('Unsupported secret-vault ciphertext envelope');
    const [,id,iv,tag,data]=parts;const key=this.keys().get(id);
    if(!key)throw new Error('The key required to decrypt this secret is unavailable');
    try{const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));decipher.setAuthTag(Buffer.from(tag,'base64url'));return Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8');}
    catch{throw new Error('Secret decryption failed; verify the keyring and ciphertext integrity');}
  }
}
