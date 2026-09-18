import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { PG_POOL } from '../database/database.module';

const scrypt = promisify(scryptCallback);
const TEAM_ROLES = ['OWNER','ADMIN','CASHIER','AGENT','READ_ONLY'] as const;
const MANAGEMENT_ROLES = new Set(['OWNER','ADMIN']);
const DELETE_CONFIRMATION = 'DELETE MY JASLYN NET ACCOUNT';

type User = NonNullable<import('../auth/auth.guard').AuthenticatedRequest['user']>;

@Injectable()
export class AccountService {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  private requireManager(user: User) {
    if (!MANAGEMENT_ROLES.has(user.role)) throw new ForbiddenException('Owner or administrator access is required');
  }

  async get(user: User) {
    const [profile, lifecycle, payment, subscription] = await Promise.all([
      this.db.query(`SELECT tenant_id AS "tenantId", business_name AS "businessName", contact_name AS "contactName", phone, email, address, logo_url AS "logoUrl", brand_color AS "brandColor", support_phone AS "supportPhone", support_whatsapp AS "supportWhatsapp", support_email AS "supportEmail", portal_headline AS "portalHeadline", portal_subtitle AS "portalSubtitle" FROM organization_profiles WHERE tenant_id=$1`, [user.tenantId]),
      this.db.query(`SELECT state, close_requested_at AS "closeRequestedAt", deletion_requested_at AS "deletionRequestedAt", deletion_execute_at AS "deletionExecuteAt" FROM account_lifecycle WHERE tenant_id=$1`, [user.tenantId]),
      this.db.query(`SELECT accept_vouchers AS "acceptVouchers", accept_online_payments AS "acceptOnlinePayments" FROM workspace_payment_settings WHERE tenant_id=$1`, [user.tenantId]),
      this.db.query(`SELECT s.status, s.starts_at AS "startsAt", s.current_period_end AS "currentPeriodEnd", p.name AS "planName", p.price, p.currency, p.billing_interval AS "billingInterval", p.max_routers AS "maxRouters", p.max_sites AS "maxSites", p.max_customers AS "maxCustomers" FROM organization_subscriptions s JOIN saas_plans p ON p.id=s.saas_plan_id WHERE s.tenant_id=$1 ORDER BY s.created_at DESC LIMIT 1`, [user.tenantId]),
    ]);
    const tenant = await this.db.query(`SELECT id AS "tenantId", name, slug, status, currency, timezone FROM tenants WHERE id=$1`, [user.tenantId]);
    return { profile: profile.rows[0] ?? null, tenant: tenant.rows[0] ?? null, lifecycle: lifecycle.rows[0] ?? null, paymentDisplay: payment.rows[0] ?? { acceptVouchers: true, acceptOnlinePayments: true }, subscription: subscription.rows[0] ?? null };
  }

  async updateProfile(user: User, body: Record<string, unknown>) {
    this.requireManager(user);
    const businessName = String(body.businessName ?? '').trim();
    if (businessName.length < 2 || businessName.length > 160) throw new BadRequestException('Business name must contain 2–160 characters');
    const values = [user.tenantId, businessName, this.text(body.contactName,160), this.text(body.phone,40), this.text(body.email,254), this.text(body.address,300)];
    await this.db.query(`INSERT INTO organization_profiles (tenant_id,business_name,contact_name,phone,email,address) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (tenant_id) DO UPDATE SET business_name=EXCLUDED.business_name,contact_name=EXCLUDED.contact_name,phone=EXCLUDED.phone,email=EXCLUDED.email,address=EXCLUDED.address,updated_at=now()`, values);
    await this.db.query('UPDATE tenants SET name=$2, updated_at=now() WHERE id=$1',[user.tenantId,businessName]);
    return this.get(user);
  }

  async updateBranding(user: User, body: Record<string, unknown>) {
    this.requireManager(user);
    const color = String(body.brandColor ?? '#1769E0').trim();
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new BadRequestException('brandColor must be a 6-digit hex color');
    await this.db.query(`INSERT INTO organization_profiles (tenant_id,business_name,brand_color,support_phone,support_whatsapp,support_email,logo_url,portal_headline,portal_subtitle) SELECT $1,name,$2,$3,$4,$5,$6,$7,$8 FROM tenants WHERE id=$1 ON CONFLICT (tenant_id) DO UPDATE SET brand_color=EXCLUDED.brand_color,support_phone=EXCLUDED.support_phone,support_whatsapp=EXCLUDED.support_whatsapp,support_email=EXCLUDED.support_email,logo_url=EXCLUDED.logo_url,portal_headline=EXCLUDED.portal_headline,portal_subtitle=EXCLUDED.portal_subtitle,updated_at=now()`, [user.tenantId,color,this.text(body.supportPhone,40),this.text(body.supportWhatsapp,40),this.text(body.supportEmail,254),this.text(body.logoUrl,500),this.text(body.portalHeadline,160) ?? 'Choose your WiFi plan',this.text(body.portalSubtitle,300) ?? 'Select a package to get connected.']);
    return this.get(user);
  }

  async updatePaymentDisplay(user: User, body: Record<string, unknown>) {
    this.requireManager(user);
    await this.db.query(`INSERT INTO workspace_payment_settings (tenant_id,accept_vouchers,accept_online_payments) VALUES ($1,$2,$3) ON CONFLICT (tenant_id) DO UPDATE SET accept_vouchers=EXCLUDED.accept_vouchers,accept_online_payments=EXCLUDED.accept_online_payments,updated_at=now()`, [user.tenantId, body.acceptVouchers !== false, body.acceptOnlinePayments !== false]);
    return this.get(user);
  }

  async team(user: User) {
    const result = await this.db.query(`SELECT id, full_name AS "fullName", email, role, is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt" FROM users WHERE tenant_id=$1 ORDER BY created_at ASC`, [user.tenantId]);
    return { data: result.rows };
  }

  async addTeamMember(user: User, body: Record<string, unknown>) {
    this.requireManager(user);
    const fullName=String(body.fullName??'').trim(), email=String(body.email??'').trim().toLowerCase(), password=String(body.password??''), role=String(body.role??'CASHIER').toUpperCase();
    if (fullName.length<2 || email.length<5 || password.length<8 || !TEAM_ROLES.includes(role as typeof TEAM_ROLES[number])) throw new BadRequestException('Valid name, email, password (8+ chars) and supported role are required');
    if (role==='OWNER' && user.role!=='OWNER') throw new ForbiddenException('Only the owner can create another owner');
    const hash=await this.hashPassword(password);
    try {
      const result=await this.db.query(`INSERT INTO users (tenant_id,email,password_hash,full_name,role) VALUES ($1,$2,$3,$4,$5) RETURNING id,full_name AS "fullName",email,role,is_active AS "isActive",created_at AS "createdAt"`,[user.tenantId,email,hash,fullName,role]);
      return result.rows[0];
    } catch(error: any) { if(error?.code==='23505') throw new ConflictException('A user with that email already exists'); throw error; }
  }

  async updateTeamMember(user: User, id: string, body: Record<string, unknown>) {
    this.requireManager(user);
    if (id===user.id && body.isActive===false) throw new ConflictException('You cannot deactivate your own account');
    const member=await this.db.query<{role:string}>(`SELECT role FROM users WHERE tenant_id=$1 AND id=$2`,[user.tenantId,id]);
    if(!member.rowCount) throw new NotFoundException('Team member not found');
    const nextRole=body.role ? String(body.role).toUpperCase() : member.rows[0].role;
    if(!TEAM_ROLES.includes(nextRole as typeof TEAM_ROLES[number])) throw new BadRequestException('Unsupported role');
    if(nextRole==='OWNER' && user.role!=='OWNER') throw new ForbiddenException('Only the owner can assign the owner role');
    if(member.rows[0].role==='OWNER' && nextRole!=='OWNER' && user.role!=='OWNER') throw new ForbiddenException('Only the owner can change the owner role');
    const active=body.isActive===undefined ? true : Boolean(body.isActive);
    await this.db.query('UPDATE users SET role=$3,is_active=$4,updated_at=now() WHERE tenant_id=$1 AND id=$2',[user.tenantId,id,nextRole,active]);
    return { ok:true };
  }

  async createSupportTicket(user: User, body: Record<string, unknown>) {
    const message=String(body.message??'').trim();
    if(message.length<5 || message.length>4000) throw new BadRequestException('Support message must contain 5–4000 characters');
    const result=await this.db.query(`INSERT INTO support_tickets (tenant_id,user_id,message) VALUES ($1,$2,$3) RETURNING id,status,created_at AS "createdAt"`,[user.tenantId,user.id,message]);
    return result.rows[0];
  }

  async close(user: User) {
    this.requireManager(user);
    await this.db.query(`INSERT INTO account_lifecycle (tenant_id,state,close_requested_at) VALUES ($1,'CLOSING',now()) ON CONFLICT (tenant_id) DO UPDATE SET state='CLOSING',close_requested_at=now(),updated_at=now()`,[user.tenantId]);
    await this.db.query(`UPDATE tenants SET status='ARCHIVED',updated_at=now() WHERE id=$1`,[user.tenantId]);
    return this.get(user);
  }

  async reopen(user: User) {
    this.requireManager(user);
    await this.db.query(`UPDATE account_lifecycle SET state='OPEN',close_requested_at=NULL,updated_at=now() WHERE tenant_id=$1`,[user.tenantId]);
    await this.db.query(`UPDATE tenants SET status='ACTIVE',updated_at=now() WHERE id=$1`,[user.tenantId]);
    return this.get(user);
  }

  async requestDeletion(user: User, body: Record<string, unknown>) {
    this.requireManager(user);
    if(String(body.confirmation??'')!==DELETE_CONFIRMATION) throw new BadRequestException(`Type exactly: ${DELETE_CONFIRMATION}`);
    await this.db.query(`INSERT INTO account_lifecycle (tenant_id,state,deletion_requested_at,deletion_execute_at) VALUES ($1,'DELETION_PENDING',now(),now()+interval '30 days') ON CONFLICT (tenant_id) DO UPDATE SET state='DELETION_PENDING',deletion_requested_at=now(),deletion_execute_at=now()+interval '30 days',updated_at=now()`,[user.tenantId]);
    return this.get(user);
  }

  async cancelDeletion(user: User) {
    this.requireManager(user);
    await this.db.query(`UPDATE account_lifecycle SET state='OPEN',deletion_requested_at=NULL,deletion_execute_at=NULL,updated_at=now() WHERE tenant_id=$1 AND state='DELETION_PENDING'`,[user.tenantId]);
    return this.get(user);
  }

  async exportData(user: User) {
    const tables=['organization_profiles','account_lifecycle','workspace_payment_settings','users','customers','packages','wifi_plan_purchases','payments','sessions','vouchers','organization_subscriptions','payment_events','access_grants','support_tickets','legal_acceptances','routers','locations'];
    const output: Record<string, unknown> = { exportedAt:new Date().toISOString(), tenantId:user.tenantId, tables:{} };
    for(const table of tables){
      const result=await this.db.query(`SELECT * FROM ${table} WHERE tenant_id=$1`,[user.tenantId]);
      (output.tables as Record<string,unknown>)[table]=result.rows;
    }
    return output;
  }

  private text(value: unknown,max:number){ const v=String(value??'').trim(); return v ? v.slice(0,max) : null; }
  private async hashPassword(password:string){ const salt=randomBytes(16); const derived=(await scrypt(password,salt,64)) as Buffer; return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`; }
}
