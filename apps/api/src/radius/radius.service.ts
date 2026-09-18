import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createSocket, Socket } from 'node:dgram';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { SecureNetworkCredentials } from '../common/secure-network-credentials';
import { CreateRadiusNasDto, SetRadiusCredentialDto } from './radius.dto';
import { ATTR, attribute, decryptUserPassword, encodeResponse, makeString, makeUInt32, makeVendorSpecific, parsePacket, RADIUS_CODES, stringAttribute, uint32Attribute, verifyRequestAuthenticator } from './radius.protocol';

@Injectable()
export class RadiusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RadiusService.name);
  private authSocket?: Socket;
  private accountingSocket?: Socket;

  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly secure: SecureNetworkCredentials,
  ) {}

  async onModuleInit() {
    if (this.config.get<string>('RADIUS_ENABLED','false') !== 'true') return;
    const authPort=Number(this.config.get<string>('RADIUS_AUTH_PORT','1812'));
    const accountingPort=Number(this.config.get<string>('RADIUS_ACCOUNTING_PORT','1813'));
    this.authSocket=createSocket('udp4'); this.accountingSocket=createSocket('udp4');
    this.authSocket.on('message',(msg,rinfo)=>void this.handlePacket(msg,rinfo,'auth'));
    this.accountingSocket.on('message',(msg,rinfo)=>void this.handlePacket(msg,rinfo,'accounting'));
    await new Promise<void>((resolve,reject)=>{this.authSocket!.once('error',reject);this.authSocket!.bind(authPort,'0.0.0.0',()=>resolve());});
    await new Promise<void>((resolve,reject)=>{this.accountingSocket!.once('error',reject);this.accountingSocket!.bind(accountingPort,'0.0.0.0',()=>resolve());});
    this.logger.log(`RADIUS UDP listening on auth=${authPort}, accounting=${accountingPort}`);
  }

  async onModuleDestroy(){ this.authSocket?.close(); this.accountingSocket?.close(); }

  async createNas(tenantId:string,input:CreateRadiusNasDto){
    const encrypted=this.secure.encrypt({password:input.secret});
    try{
      const r=await this.db.query(`INSERT INTO radius_nas_clients(tenant_id,name,address,secret_encrypted,enabled) VALUES($1,$2,$3,$4,$5) RETURNING id,name,address::text AS "address",auth_port AS "authPort",accounting_port AS "accountingPort",coa_port AS "coaPort",enabled,created_at AS "createdAt"`,[tenantId,input.name.trim(),input.address,encrypted,input.enabled??true]);
      return r.rows[0];
    }catch(e:any){if(e?.code==='23505') throw new Error('RADIUS NAS address already exists for this tenant');throw e;}
  }

  async listNas(tenantId:string){
    const r=await this.db.query(`SELECT id,name,address::text AS "address",auth_port AS "authPort",accounting_port AS "accountingPort",coa_port AS "coaPort",enabled,created_at AS "createdAt",updated_at AS "updatedAt" FROM radius_nas_clients WHERE tenant_id=$1 ORDER BY name`,[tenantId]);return {data:r.rows};
  }

  async setCredential(tenantId:string,input:SetRadiusCredentialDto){
    const binding=await this.db.query(`SELECT id,username FROM customer_access_bindings WHERE tenant_id=$1 AND id=$2`,[tenantId,input.accessBindingId]);
    if(!binding.rowCount) throw new Error('Access binding not found');
    const salt=randomBytes(16).toString('base64url'); const hash=scryptSync(input.password,salt,32).toString('base64url');
    await this.db.query(`INSERT INTO radius_user_credentials(tenant_id,access_binding_id,password_salt,password_hash,enabled) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,access_binding_id) DO UPDATE SET password_salt=EXCLUDED.password_salt,password_hash=EXCLUDED.password_hash,enabled=EXCLUDED.enabled,updated_at=now()`,[tenantId,input.accessBindingId,salt,hash,input.enabled??true]);
    await this.audit.record(tenantId,'RADIUS_CREDENTIAL_UPDATED','radius_user_credential',input.accessBindingId,{username:binding.rows[0].username,enabled:input.enabled??true});
    return {accessBindingId:input.accessBindingId,username:binding.rows[0].username,enabled:input.enabled??true};
  }

  private async handlePacket(raw:Buffer,rinfo:{address:string},kind:'auth'|'accounting'){
    let packet; try{packet=parsePacket(raw);}catch{return;}
    const nas=await this.db.query(`SELECT id,tenant_id,secret_encrypted,enabled FROM radius_nas_clients WHERE address=$1::inet AND enabled=true LIMIT 1`,[rinfo.address]).catch(()=>({rowCount:0,rows:[] as any[]}));
    if(!nas.rowCount) return;
    const row=nas.rows[0]; const secretObj=this.secure.decrypt(row.secret_encrypted); const secret=Buffer.from(secretObj.password??'','utf8');
    if (!secret.length) return;
    try{
      if (kind === 'accounting' && !verifyRequestAuthenticator(packet, raw, secret)) return;
      if(kind==='auth' && packet.code===RADIUS_CODES.ACCESS_REQUEST) await this.handleAccessRequest(raw,packet,row.tenant_id,row.id,secret,rinfo.address,rinfo.port);
      else if(kind==='accounting' && packet.code===RADIUS_CODES.ACCOUNTING_REQUEST) await this.handleAccounting(raw,packet,row.tenant_id,row.id,secret,rinfo.address,rinfo.port);
    }catch(error){this.logger.error(error instanceof Error?error.message:String(error));}
  }

  private async handleAccessRequest(raw:Buffer,packet:any,tenantId:string,nasId:string,secret:Buffer,nasAddress:string,nasPort:number){
    const username=stringAttribute(packet,ATTR.USER_NAME); const encryptedPassword=attribute(packet,ATTR.USER_PASSWORD);
    if(!username || !encryptedPassword){return;}
    const password=decryptUserPassword(encryptedPassword,secret,packet.authenticator).toString('utf8');
    const binding=await this.db.query(`SELECT b.id,b.username,b.state,b.expires_at,p.duration_seconds,p.data_limit_bytes,p.download_bps,p.upload_bps FROM customer_access_bindings b LEFT JOIN packages p ON p.tenant_id=b.tenant_id AND p.id=b.package_id WHERE b.tenant_id=$1 AND b.username=$2 LIMIT 1`,[tenantId,username]);
    let accepted=false; let reply: any[]=[];
    if(binding.rowCount && binding.rows[0].state==='ACTIVE' && (!binding.rows[0].expires_at || new Date(binding.rows[0].expires_at)>new Date())){
      const cred=await this.db.query(`SELECT password_salt,password_hash,enabled FROM radius_user_credentials WHERE tenant_id=$1 AND access_binding_id=$2`,[tenantId,binding.rows[0].id]);
      if(cred.rowCount && cred.rows[0].enabled){
        const candidate=scryptSync(password,cred.rows[0].password_salt,32); const expected=Buffer.from(cred.rows[0].password_hash,'base64url');
        accepted=candidate.length===expected.length && timingSafeEqual(candidate,expected);
      }
      if(accepted){
        const duration=Math.max(1,Number(binding.rows[0].duration_seconds||0));
        reply=[makeUInt32(ATTR.SESSION_TIMEOUT,Math.min(duration,2147483647)),makeUInt32(ATTR.ACCT_INTERIM_INTERVAL,Math.min(300,Math.max(60,Math.trunc(duration/20)||60)))];
        if(binding.rows[0].download_bps || binding.rows[0].upload_bps){
          const down=Math.max(1,Math.round(Number(binding.rows[0].download_bps||binding.rows[0].upload_bps)/1000)); const up=Math.max(1,Math.round(Number(binding.rows[0].upload_bps||binding.rows[0].download_bps)/1000));
          reply.push(makeVendorSpecific(14988,8,`${Math.max(1,Math.round(Number(binding.rows[0].upload_bps||binding.rows[0].download_bps)/1000))}k/${Math.max(1,Math.round(Number(binding.rows[0].download_bps||binding.rows[0].upload_bps)/1000))}k`));
        }
      }
    }
    const response=encodeResponse(accepted?RADIUS_CODES.ACCESS_ACCEPT:RADIUS_CODES.ACCESS_REJECT,packet.identifier,packet.authenticator,accepted?reply:[makeString(ATTR.REPLY_MESSAGE,'Access denied')],secret);
    this.authSocket?.send(response,0,response.length,nasPort,nasAddress);
    await this.db.query(`INSERT INTO radius_events(tenant_id,nas_client_id,packet_code,packet_identifier,username,result) VALUES($1,$2,$3,$4,$5,$6)`,[tenantId,nasId,packet.code,packet.identifier,username,accepted?'ACCEPT':'REJECT']).catch(()=>undefined);
  }

  private async handleAccounting(raw:Buffer,packet:any,tenantId:string,nasId:string,secret:Buffer,nasAddress:string,nasPort:number){
    const status=uint32Attribute(packet,ATTR.ACCT_STATUS_TYPE); const map:any={1:'START',3:'INTERIM_UPDATE',2:'STOP',7:'ON'};
    const statusType=map[status??0]; if(!statusType)return;
    const username=stringAttribute(packet,ATTR.USER_NAME)??null; const sessionId=stringAttribute(packet,ATTR.ACCT_SESSION_ID)??null;
    await this.db.query(`INSERT INTO radius_accounting_events(tenant_id,nas_client_id,username,acct_session_id,status_type,calling_station_id,input_octets,output_octets,session_time,raw_attributes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[tenantId,nasId,username,sessionId,statusType,stringAttribute(packet,ATTR.CALLING_STATION_ID)??null,uint32Attribute(packet,ATTR.ACCT_INPUT_OCTETS)??null,uint32Attribute(packet,ATTR.ACCT_OUTPUT_OCTETS)??null,uint32Attribute(packet,ATTR.ACCT_SESSION_TIME)??null,JSON.stringify(packet.attributes.map((a:any)=>({type:a.type,value:a.value.toString('base64')})))]); 
    const response=encodeResponse(RADIUS_CODES.ACCOUNTING_RESPONSE,packet.identifier,packet.authenticator,[],secret); this.accountingSocket?.send(response,0,response.length,nasPort,nasAddress);
  }
}
