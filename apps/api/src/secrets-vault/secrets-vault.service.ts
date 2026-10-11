import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditContext } from '../audit/audit.service';
import { CreateTenantSecretDto } from './secrets-vault.dto';
import { SecureSecretVault } from './secure-secret-vault';

@Injectable()
export class SecretsVaultService {
  private readonly vault:SecureSecretVault;
  constructor(@Inject(PG_POOL) private readonly db:Pool,config:ConfigService){this.vault=new SecureSecretVault(config);}

  async list(tenantId:string){
    const r=await this.db.query(`SELECT id,secret_key AS "secretKey",display_name AS "displayName",purpose,
      encryption_key_id AS "encryptionKeyId",metadata,version,created_at AS "createdAt",updated_at AS "updatedAt",
      last_rotated_at AS "lastRotatedAt" FROM tenant_secrets WHERE tenant_id=$1 ORDER BY display_name`,[tenantId]);
    return {data:r.rows,count:r.rowCount??0};
  }

  async create(tenantId:string,actorUserId:string,input:CreateTenantSecretDto,context:AuditContext={}){
    const metadataText=JSON.stringify(input.metadata??{});
    if(metadataText.length>4096)throw new BadRequestException('Secret metadata exceeds the 4 KB limit');
    if(input.displayName.trim().length<2||input.purpose.trim().length<2)throw new BadRequestException('Display name and purpose must contain at least two non-space characters');
    if(/\"(secret|token|password|apiKey|accessKey|credential|privateKey)\"/i.test(metadataText))throw new BadRequestException('Secret values must not be stored in metadata');
    const encrypted=this.vault.encrypt(input.secretValue);
    const client=await this.db.connect();
    try{
      await client.query('BEGIN');
      const r=await client.query(`INSERT INTO tenant_secrets(tenant_id,secret_key,display_name,purpose,encrypted_value,encryption_key_id,metadata,created_by,updated_by)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$8)
        RETURNING id,secret_key AS "secretKey",display_name AS "displayName",purpose,encryption_key_id AS "encryptionKeyId",version,created_at AS "createdAt"`,
        [tenantId,input.secretKey,input.displayName.trim(),input.purpose.trim(),encrypted.envelope,encrypted.keyId,JSON.stringify(input.metadata??{}),actorUserId]);
      await client.query(`INSERT INTO audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,correlation_id,ip_address,user_agent,metadata)
        VALUES($1,$2,'TENANT_SECRET_CREATED','tenant_secret',$3,$4,$5,$6,$7,$8::jsonb)`,
        [tenantId,actorUserId,r.rows[0].id,context.requestId??null,context.correlationId??null,context.ipAddress??null,context.userAgent??null,JSON.stringify({secretKey:input.secretKey,purpose:input.purpose,encryptionKeyId:encrypted.keyId})]);
      await client.query('COMMIT');return r.rows[0];
    }catch(e){await client.query('ROLLBACK').catch(()=>undefined);if(typeof e==='object'&&e!==null&&'code'in e&&(e as {code?:string}).code==='23505')throw new ConflictException('A secret with this key already exists in the tenant vault');throw e;}
    finally{client.release();}
  }

  async deleteSecret(tenantId:string,actorUserId:string,id:string,context:AuditContext={}){
    const client=await this.db.connect();
    try{
      await client.query('BEGIN');
      const deleted=await client.query(`DELETE FROM tenant_secrets WHERE tenant_id=$1 AND id=$2 RETURNING secret_key,display_name`,[tenantId,id]);
      if(!deleted.rowCount)throw new NotFoundException('Secret not found in this tenant vault');
      await client.query(`INSERT INTO audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,correlation_id,ip_address,user_agent,metadata)
        VALUES($1,$2,'TENANT_SECRET_DELETED','tenant_secret',$3,$4,$5,$6,$7,$8::jsonb)`,
        [tenantId,actorUserId,id,context.requestId??null,context.correlationId??null,context.ipAddress??null,context.userAgent??null,JSON.stringify({secretKey:deleted.rows[0].secret_key,displayName:deleted.rows[0].display_name})]);
      await client.query('COMMIT');return {deleted:true,id};
    }catch(e){await client.query('ROLLBACK').catch(()=>undefined);throw e;}finally{client.release();}
  }

  async rotateAll(tenantId:string,actorUserId:string,context:AuditContext={}){
    const activeKeyId=this.vault.activeKeyId();const client=await this.db.connect();let rotatedCount=0;let skippedCount=0;
    try{
      await client.query('BEGIN');
      const secrets=await client.query(`SELECT id,secret_key,encrypted_value,encryption_key_id FROM tenant_secrets WHERE tenant_id=$1 ORDER BY id FOR UPDATE`,[tenantId]);
      for(const secret of secrets.rows){
        if(secret.encryption_key_id===activeKeyId){skippedCount++;continue;}
        const plaintext=this.vault.decrypt(secret.encrypted_value);
        const encrypted=this.vault.encrypt(plaintext);
        await client.query(`UPDATE tenant_secrets SET encrypted_value=$3,encryption_key_id=$4,version=version+1,updated_by=$5,updated_at=now(),last_rotated_at=now() WHERE tenant_id=$1 AND id=$2`,[tenantId,secret.id,encrypted.envelope,encrypted.keyId,actorUserId]);
        rotatedCount++;
      }
      await client.query(`INSERT INTO audit_logs(tenant_id,actor_user_id,action,resource_type,request_id,correlation_id,ip_address,user_agent,metadata)
        VALUES($1,$2,'TENANT_SECRET_VAULT_ROTATED','tenant_secret_vault',$3,$4,$5,$6,$7::jsonb)`,
        [tenantId,actorUserId,context.requestId??null,context.correlationId??null,context.ipAddress??null,context.userAgent??null,JSON.stringify({rotatedCount,skippedCount,activeKeyId})]);
      await client.query('COMMIT');return {rotatedCount,skippedCount,activeKeyId,completed:true};
    }catch(e){await client.query('ROLLBACK').catch(()=>undefined);throw e;}finally{client.release();}
  }

  async rotateOne(tenantId:string,actorUserId:string,id:string,context:AuditContext={}){
    const activeKeyId=this.vault.activeKeyId();const client=await this.db.connect();
    try{
      await client.query('BEGIN');
      const selected=await client.query(`SELECT id,secret_key,encrypted_value,encryption_key_id FROM tenant_secrets WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,[tenantId,id]);
      if(!selected.rowCount)throw new NotFoundException('Secret not found in this tenant vault');
      const secret=selected.rows[0];
      if(secret.encryption_key_id===activeKeyId){await client.query('COMMIT');return {id,rotated:false,encryptionKeyId:activeKeyId};}
      const encrypted=this.vault.encrypt(this.vault.decrypt(secret.encrypted_value));
      await client.query(`UPDATE tenant_secrets SET encrypted_value=$3,encryption_key_id=$4,version=version+1,updated_by=$5,updated_at=now(),last_rotated_at=now() WHERE tenant_id=$1 AND id=$2`,[tenantId,id,encrypted.envelope,encrypted.keyId,actorUserId]);
      await client.query(`INSERT INTO audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,correlation_id,ip_address,user_agent,metadata)
        VALUES($1,$2,'TENANT_SECRET_ROTATED','tenant_secret',$3,$4,$5,$6,$7,$8::jsonb)`,
        [tenantId,actorUserId,id,context.requestId??null,context.correlationId??null,context.ipAddress??null,context.userAgent??null,JSON.stringify({secretKey:secret.secret_key,encryptionKeyId:encrypted.keyId})]);
      await client.query('COMMIT');return {id,rotated:true,encryptionKeyId:encrypted.keyId};
    }catch(e){await client.query('ROLLBACK').catch(()=>undefined);throw e;}finally{client.release();}
  }

  // Internal integration hook. There is deliberately no HTTP endpoint that returns plaintext.
  async getSecretValue(tenantId:string,secretKey:string){
    const r=await this.db.query('SELECT encrypted_value FROM tenant_secrets WHERE tenant_id=$1 AND secret_key=$2',[tenantId,secretKey]);
    if(!r.rowCount)throw new NotFoundException('Secret not found in this tenant vault');
    return this.vault.decrypt(r.rows[0].encrypted_value);
  }
}
