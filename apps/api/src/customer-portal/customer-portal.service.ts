import { BadRequestException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { SignJWT } from 'jose';
import { PG_POOL } from '../database/database.module';
import { AuditContext, AuditService } from '../audit/audit.service';
import { CustomerCommerceService } from '../customer-commerce/customer-commerce.service';
import { RenewalScheduleDto } from '../customer-commerce/customer-commerce.dto';
import { PaymentsService } from '../payments/payments.service';
import { PurchasesService } from '../purchases/purchases.service';
import { CustomerPortalActivationDto, CustomerPortalCreatePurchaseDto, CustomerPortalLoginDto, CustomerPortalPurchaseIntentDto, CustomerPortalSupportDto } from './customer-portal.dto';

const scrypt=promisify(scryptCallback);
const KEY_LENGTH=64;
const SESSION_HOURS=12;
@Injectable()
export class CustomerPortalService {
  constructor(@Inject(PG_POOL) private readonly db:Pool,private readonly config:ConfigService,private readonly audit:AuditService,
    private readonly commerce:CustomerCommerceService,private readonly payments:PaymentsService,private readonly purchases:PurchasesService){}

  async issueInvitation(tenantId:string,actorId:string,customerId:string,context:AuditContext={}){
    const customer=await this.db.query('SELECT c.id,c.full_name AS "fullName",c.username,t.slug AS "tenantSlug" FROM customers c JOIN tenants t ON t.id=c.tenant_id WHERE c.tenant_id=$1 AND c.id=$2 AND c.is_active=true',[tenantId,customerId]);
    if(!customer.rowCount)throw new NotFoundException('Active customer not found in this tenant');
    const token=randomBytes(32).toString('base64url'),tokenHash=this.hashToken(token);
    const client=await this.db.connect();
    let invitation: { expiresAt: string };
    try{
      await client.query('BEGIN');
      await client.query('UPDATE customer_portal_invitations SET expires_at=now() WHERE tenant_id=$1 AND customer_id=$2 AND consumed_at IS NULL AND expires_at>now()',[tenantId,customerId]);
      const r=await client.query(`INSERT INTO customer_portal_invitations(tenant_id,customer_id,token_hash,expires_at,created_by)
        VALUES($1,$2,$3,now()+interval '24 hours',$4) RETURNING expires_at AS "expiresAt"`,[tenantId,customerId,tokenHash,actorId]);
      invitation=r.rows[0];
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}finally{client.release();}
    await this.audit.record(tenantId,'CUSTOMER_PORTAL_INVITATION_ISSUED','customer',customerId,{expiresAt:invitation.expiresAt},{...context,userId:actorId});
    return {customer:customer.rows[0],invitationToken:token,expiresAt:invitation.expiresAt,delivery:'Share this one-time token through an approved private channel; it is shown only once.'};
  }

  async activate(input:CustomerPortalActivationDto){
    if(input.password.length<12)throw new BadRequestException('Password must contain at least 12 characters');
    const hash=await this.hashPassword(input.password),tokenHash=this.hashToken(input.invitationToken);
    const client=await this.db.connect();let tenantId='',customerId='';
    try{
      await client.query('BEGIN');
      const invitation=await client.query(`SELECT i.tenant_id AS "tenantId",i.customer_id AS "customerId",c.is_active AS "isActive"
        FROM customer_portal_invitations i JOIN customers c ON c.tenant_id=i.tenant_id AND c.id=i.customer_id
        WHERE i.token_hash=$1 AND i.consumed_at IS NULL AND i.expires_at>now() FOR UPDATE OF i`,[tokenHash]);
      if(!invitation.rowCount||!invitation.rows[0].isActive)throw new UnauthorizedException('Invitation is invalid, expired, or already used');
      tenantId=invitation.rows[0].tenantId;customerId=invitation.rows[0].customerId;
      await client.query(`INSERT INTO customer_portal_credentials(tenant_id,customer_id,password_hash)
        VALUES($1,$2,$3) ON CONFLICT(tenant_id,customer_id) DO UPDATE SET password_hash=EXCLUDED.password_hash,
        failed_login_attempts=0,locked_until=NULL,password_changed_at=now(),updated_at=now()`,[tenantId,customerId,hash]);
      await client.query('UPDATE customer_portal_invitations SET consumed_at=now() WHERE token_hash=$1',[tokenHash]);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}finally{client.release();}
    await this.audit.record(tenantId,'CUSTOMER_PORTAL_ACTIVATED','customer',customerId,{passwordSet:true});
    return {activated:true,message:'Portal account activated. Sign in with your tenant slug, username and new password.'};
  }

  async login(input:CustomerPortalLoginDto,context:{ip?:string;userAgent?:string}={}){
    const r=await this.db.query(`SELECT c.id AS "customerId",c.tenant_id AS "tenantId",c.username,c.full_name AS "fullName",
      c.email,t.slug AS "tenantSlug",p.password_hash AS "passwordHash",p.failed_login_attempts AS "failedAttempts",p.locked_until AS "lockedUntil"
      FROM customers c JOIN tenants t ON t.id=c.tenant_id
      JOIN customer_portal_credentials p ON p.tenant_id=c.tenant_id AND p.customer_id=c.id
      WHERE t.slug=$1 AND lower(c.username)=lower($2) AND c.is_active=true LIMIT 1`,
      [input.tenantSlug.trim().toLowerCase(),input.username.trim()]);
    if(!r.rowCount)throw new UnauthorizedException('Invalid tenant, username or password');
    const row=r.rows[0];
    if(row.lockedUntil&&new Date(row.lockedUntil).getTime()>Date.now())throw new UnauthorizedException('Sign-in temporarily locked; try again later');
    const valid=await this.verifyPassword(input.password,row.passwordHash);
    if(!valid){
      await this.db.query(`UPDATE customer_portal_credentials SET failed_login_attempts=failed_login_attempts+1,
        locked_until=CASE WHEN failed_login_attempts+1>=5 THEN now()+interval '15 minutes' ELSE locked_until END
        WHERE tenant_id=$1 AND customer_id=$2`,[row.tenantId,row.customerId]);
      await this.audit.record(row.tenantId,'CUSTOMER_PORTAL_LOGIN_FAILED','customer',row.customerId,{ip:context.ip??null},{ipAddress:context.ip,userAgent:context.userAgent});
      throw new UnauthorizedException('Invalid tenant, username or password');
    }
    const secret=this.config.get<string>('JWT_SECRET');
    if(!secret||secret.length<32)throw new BadRequestException('Customer portal authentication is not configured');
    const sessionId=randomUUID();
    const session=await this.db.query(`INSERT INTO customer_portal_sessions(id,tenant_id,customer_id,expires_at)
      VALUES($1,$2,$3,now()+($4*interval '1 hour')) RETURNING expires_at AS "expiresAt"`,[sessionId,row.tenantId,row.customerId,SESSION_HOURS]);
    await this.db.query(`UPDATE customer_portal_credentials SET failed_login_attempts=0,locked_until=NULL,last_login_at=now()
      WHERE tenant_id=$1 AND customer_id=$2`,[row.tenantId,row.customerId]);
    const token=await new SignJWT({tenantId:row.tenantId,role:'CUSTOMER',sid:sessionId,username:row.username})
      .setProtectedHeader({alg:'HS256'}).setIssuer('jaslyn-net').setAudience('jaslyn-customer-portal')
      .setSubject(row.customerId).setIssuedAt().setExpirationTime('12h').sign(new TextEncoder().encode(secret));
    await this.audit.record(row.tenantId,'CUSTOMER_PORTAL_LOGIN_SUCCEEDED','customer',row.customerId,{sessionId,ip:context.ip??null},{ipAddress:context.ip,userAgent:context.userAgent});
    return {accessToken:token,tokenType:'Bearer',expiresAt:session.rows[0].expiresAt,customer:{id:row.customerId,fullName:row.fullName,username:row.username,tenantSlug:row.tenantSlug,email:row.email??null}};
  }

  async logout(tenantId:string,customerId:string,sessionId:string){
    await this.db.query('UPDATE customer_portal_sessions SET revoked_at=now() WHERE tenant_id=$1 AND customer_id=$2 AND id=$3 AND revoked_at IS NULL',[tenantId,customerId,sessionId]);
    await this.audit.record(tenantId,'CUSTOMER_PORTAL_LOGOUT','customer',customerId,{sessionId});
    return {loggedOut:true};
  }

  async overview(tenantId:string,customerId:string){
    const customer=await this.db.query('SELECT id,full_name AS "fullName",username,email,phone FROM customers WHERE tenant_id=$1 AND id=$2 AND is_active=true',[tenantId,customerId]);
    if(!customer.rowCount)throw new NotFoundException('Customer account not found');
    const [commerce,payments,invoices,packages]=await Promise.all([
      this.commerce.overview(tenantId,customerId),
      this.db.query(`SELECT id,amount,currency,provider,status,provider_reference AS "providerReference",created_at AS "createdAt"
        FROM payments WHERE tenant_id=$1 AND customer_id=$2 ORDER BY created_at DESC LIMIT 50`,[tenantId,customerId]),
      this.db.query(`SELECT id,total,currency,status,created_at AS "createdAt"
        FROM invoices WHERE tenant_id=$1 AND customer_id=$2 ORDER BY created_at DESC LIMIT 50`,[tenantId,customerId]),
      this.listPackages(tenantId),
    ]);
    return {customer:customer.rows[0],commerce,payments:payments.rows,invoices:invoices.rows,packages};
  }

  async listPackages(tenantId:string){
    const r=await this.db.query(`SELECT id,name,price,currency,duration_seconds AS "durationSeconds",data_limit_bytes AS "dataLimitBytes",
      download_bps AS "downloadBps",upload_bps AS "uploadBps"
      FROM packages WHERE tenant_id=$1 AND is_active=true AND show_on_portal=true ORDER BY price ASC LIMIT 500`,[tenantId]);
    return {data:r.rows};
  }

  async createPurchase(tenantId:string,customerId:string,input:CustomerPortalCreatePurchaseDto){
    const plan=await this.db.query('SELECT id FROM packages WHERE tenant_id=$1 AND id=$2 AND is_active=true AND show_on_portal=true',[tenantId,input.packageId]);
    if(!plan.rowCount)throw new NotFoundException('Package is not available for customer self-service');
    const purchase=await this.purchases.create(tenantId,{customerId,packageId:input.packageId,routerId:input.routerId,promoCode:input.promoCode});
    await this.audit.record(tenantId,'CUSTOMER_PORTAL_PURCHASE_CREATED','purchase',purchase.id,{customerId,packageId:input.packageId,routerId:input.routerId??null});
    return purchase;
  }

  async createPurchaseIntent(tenantId:string,customerId:string,input:CustomerPortalPurchaseIntentDto){
    const purchase=await this.db.query(`SELECT id,status FROM wifi_plan_purchases WHERE tenant_id=$1 AND customer_id=$2 AND id=$3`,[tenantId,customerId,input.purchaseId]);
    if(!purchase.rowCount)throw new NotFoundException('Purchase not found for this customer');
    if(!['PENDING_PAYMENT','PAID'].includes(purchase.rows[0].status))throw new BadRequestException('This purchase cannot accept a payment intent');
    if(purchase.rows[0].status==='PAID')throw new BadRequestException('This purchase is already paid');
    return this.payments.createIntent(tenantId,input);
  }

  async setRenewal(tenantId:string,customerId:string,input:RenewalScheduleDto){
    return this.commerce.setRenewal(tenantId,customerId,input);
  }

  async createSupport(tenantId:string,customerId:string,input:CustomerPortalSupportDto){
    return this.commerce.createSupport(tenantId,customerId,input);
  }

  private hashToken(value:string){return createHash('sha256').update(value).digest('hex');}
  private async hashPassword(password:string){const salt=randomBytes(16);const derived=(await scrypt(password,salt,KEY_LENGTH)) as Buffer;return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;}
  private async verifyPassword(password:string,stored:string){
    try{const [scheme,saltEncoded,hashEncoded]=stored.split('$');if(scheme!=='scrypt'||!saltEncoded||!hashEncoded)return false;
      const salt=Buffer.from(saltEncoded,'base64url'),expected=Buffer.from(hashEncoded,'base64url');
      if(salt.length<16||expected.length!==KEY_LENGTH)return false;
      const actual=(await scrypt(password,salt,KEY_LENGTH)) as Buffer;return timingSafeEqual(expected,actual);
    }catch{return false;}
  }
}
