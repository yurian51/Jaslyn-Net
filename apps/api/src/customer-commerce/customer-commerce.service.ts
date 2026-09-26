import { BadRequestException, Inject, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { PurchasesService } from '../purchases/purchases.service';
import { PG_POOL } from '../database/database.module';
import { BeneficiaryDto, LimitDto, NotificationPreferenceDto, ReferralDto, RenewalScheduleDto, SavedPurchaseDto, SupportCaseDto, VerificationDto, WalletEntryDto } from './customer-commerce.dto';

@Injectable()
export class CustomerCommerceService implements OnModuleInit, OnModuleDestroy {
  private renewalTimer?: NodeJS.Timeout;
  constructor(@Inject(PG_POOL) private readonly db: Pool, private readonly purchases: PurchasesService) {}

  onModuleInit() { this.renewalTimer = setInterval(() => void this.processDueRenewals(), 30_000); void this.processDueRenewals(); }
  onModuleDestroy() { if (this.renewalTimer) clearInterval(this.renewalTimer); }

  async overview(tenantId:string, customerId:string) {
    const [wallet, recent, beneficiaries, saved, rewards, limits, verification, preferences, support] = await Promise.all([
      this.wallet(tenantId, customerId),
      this.db.query(`SELECT p.id,p.status,p.price,p.currency,p.starts_at AS "startsAt",p.ends_at AS "endsAt",k.name AS "packageName" FROM wifi_plan_purchases p JOIN packages k ON k.tenant_id=p.tenant_id AND k.id=p.package_id WHERE p.tenant_id=$1 AND p.customer_id=$2 ORDER BY p.created_at DESC LIMIT 20`,[tenantId,customerId]),
      this.listBeneficiaries(tenantId,customerId), this.listSavedPurchases(tenantId,customerId),
      this.db.query(`SELECT id,reward_type AS "rewardType",points,amount,currency,status,expires_at AS "expiresAt",created_at AS "createdAt" FROM commerce_rewards WHERE tenant_id=$1 AND customer_id=$2 ORDER BY created_at DESC LIMIT 50`,[tenantId,customerId]),
      this.getLimits(tenantId,customerId), this.listVerifications(tenantId,customerId), this.getPreferences(tenantId,customerId),
      this.listSupport(tenantId,customerId)
    ]);
    return {wallet,recentPurchases:recent.rows,beneficiaries,savedPurchases:saved,rewards:rewards.rows,limits,verification,preferences,support};
  }

  async listRenewals(tenantId:string,customerId:string) {
    const r=await this.db.query(`SELECT r.id,r.saved_purchase_id AS "savedPurchaseId",r.next_run_at AS "nextRunAt",r.status,r.failure_count AS "failureCount",r.last_run_at AS "lastRunAt",s.label,s.package_id AS "packageId",s.auto_renew AS "autoRenew" FROM commerce_renewal_schedules r JOIN commerce_saved_purchases s ON s.tenant_id=r.tenant_id AND s.id=r.saved_purchase_id WHERE r.tenant_id=$1 AND r.customer_id=$2 ORDER BY r.next_run_at`,[tenantId,customerId]);
    return r.rows;
  }

  async setRenewal(tenantId:string,customerId:string,d:RenewalScheduleDto) {
    const parsed=new Date(d.nextRunAt);
    if(Number.isNaN(parsed.getTime())) throw new BadRequestException('Invalid nextRunAt');
    const saved=await this.db.query(`SELECT id FROM commerce_saved_purchases WHERE tenant_id=$1 AND id=$2 AND customer_id=$3 AND active=true`,[tenantId,d.savedPurchaseId,customerId]);
    if(!saved.rowCount) throw new NotFoundException('Saved purchase not found');
    const r=await this.db.query(`INSERT INTO commerce_renewal_schedules (tenant_id,customer_id,saved_purchase_id,next_run_at,status) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id,saved_purchase_id) DO UPDATE SET next_run_at=EXCLUDED.next_run_at,status=EXCLUDED.status,updated_at=now() RETURNING id,saved_purchase_id AS "savedPurchaseId",next_run_at AS "nextRunAt",status`,[tenantId,customerId,d.savedPurchaseId,parsed.toISOString(),d.status??'ACTIVE']);
    return r.rows[0];
  }

  async wallet(tenantId:string,customerId:string) {
    const r=await this.db.query(`INSERT INTO customer_wallets (tenant_id,customer_id,currency) SELECT $1,$2,'TZS' ON CONFLICT (tenant_id,customer_id,currency) DO UPDATE SET updated_at=now() RETURNING id,currency,balance,status`,[tenantId,customerId]);
    if(!r.rowCount) throw new NotFoundException('Customer wallet unavailable');
    const e=await this.db.query(`SELECT id,entry_type AS "entryType",amount,currency,reference_type AS "referenceType",reference_id AS "referenceId",description,created_at AS "createdAt" FROM customer_wallet_entries WHERE tenant_id=$1 AND wallet_id=$2 ORDER BY created_at DESC LIMIT 50`,[tenantId,r.rows[0].id]);
    return {account:r.rows[0],entries:e.rows};
  }

  async addWalletEntry(tenantId:string,customerId:string,input:WalletEntryDto) {
    const client=await this.db.connect();
    try {
      await client.query('BEGIN');
      const w=await client.query(`SELECT id,currency,balance,status FROM customer_wallets WHERE tenant_id=$1 AND customer_id=$2 AND currency=$3 FOR UPDATE`,[tenantId,customerId,input.currency.toUpperCase()]);
      if(!w.rowCount) throw new NotFoundException('Wallet not found');
      if(w.rows[0].status!=='ACTIVE') throw new BadRequestException('Wallet is not active');
      const existing=await client.query(`SELECT id FROM customer_wallet_entries WHERE tenant_id=$1 AND idempotency_key=$2`,[tenantId,input.idempotencyKey]);
      if(existing.rowCount){await client.query('COMMIT');return {reused:true,id:existing.rows[0].id};}
      const signed=['PURCHASE','TRANSFER_OUT'].includes(input.entryType) ? -Number(input.amount) : Number(input.amount);
      if(Number(w.rows[0].balance)+signed<0) throw new BadRequestException('Insufficient wallet balance');
      const entry=await client.query(`INSERT INTO customer_wallet_entries (tenant_id,wallet_id,entry_type,amount,currency,idempotency_key,description) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[tenantId,w.rows[0].id,input.entryType,input.amount,input.currency.toUpperCase(),input.idempotencyKey,input.description??null]);
      await client.query(`UPDATE customer_wallets SET balance=balance+$3,updated_at=now() WHERE tenant_id=$1 AND id=$2`,[tenantId,w.rows[0].id,signed]);
      await client.query('COMMIT'); return {reused:false,id:entry.rows[0].id,balance:Number(w.rows[0].balance)+signed};
    } catch(e){await client.query('ROLLBACK').catch(()=>undefined);throw e;} finally{client.release();}
  }

  async listBeneficiaries(tenantId:string,customerId:string){const r=await this.db.query(`SELECT id,display_name AS "displayName",phone,beneficiary_customer_id AS "beneficiaryCustomerId",package_id AS "packageId",router_id AS "routerId",is_favorite AS "isFavorite",created_at AS "createdAt" FROM customer_beneficiaries WHERE tenant_id=$1 AND customer_id=$2 ORDER BY is_favorite DESC,created_at DESC`,[tenantId,customerId]);return r.rows;}
  async saveBeneficiary(tenantId:string,customerId:string,d:BeneficiaryDto){const r=await this.db.query(`INSERT INTO customer_beneficiaries (tenant_id,customer_id,display_name,phone,beneficiary_customer_id,package_id,router_id,is_favorite) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (tenant_id,customer_id,beneficiary_customer_id,phone) DO UPDATE SET display_name=EXCLUDED.display_name,package_id=EXCLUDED.package_id,router_id=EXCLUDED.router_id,is_favorite=EXCLUDED.is_favorite,updated_at=now() RETURNING id`,[tenantId,customerId,d.displayName,d.phone??null,d.beneficiaryCustomerId??null,d.packageId??null,d.routerId??null,d.isFavorite??false]);return r.rows[0];}
  async listSavedPurchases(tenantId:string,customerId:string){const r=await this.db.query(`SELECT s.id,s.label,s.package_id AS "packageId",k.name AS "packageName",s.beneficiary_id AS "beneficiaryId",s.router_id AS "routerId",s.auto_renew AS "autoRenew",s.renewal_days AS "renewalDays",s.active FROM commerce_saved_purchases s JOIN packages k ON k.tenant_id=s.tenant_id AND k.id=s.package_id WHERE s.tenant_id=$1 AND s.customer_id=$2 ORDER BY s.created_at DESC`,[tenantId,customerId]);return r.rows;}
  async savePurchase(tenantId:string,customerId:string,d:SavedPurchaseDto){const r=await this.db.query(`INSERT INTO commerce_saved_purchases (tenant_id,customer_id,beneficiary_id,package_id,router_id,label,auto_renew,renewal_days) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (tenant_id,customer_id,label) DO UPDATE SET beneficiary_id=EXCLUDED.beneficiary_id,package_id=EXCLUDED.package_id,router_id=EXCLUDED.router_id,auto_renew=EXCLUDED.auto_renew,renewal_days=EXCLUDED.renewal_days,active=true,updated_at=now() RETURNING id`,[tenantId,customerId,d.beneficiaryId??null,d.packageId,d.routerId??null,d.label,d.autoRenew??false,d.renewalDays??0]);return r.rows[0];}
  async createReferral(tenantId:string,customerId:string){const code=`JAS-${customerId.replaceAll('-','').slice(0,8).toUpperCase()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;const r=await this.db.query(`INSERT INTO commerce_referrals (tenant_id,referrer_customer_id,code) VALUES ($1,$2,$3) RETURNING code,status,reward_amount AS "rewardAmount",currency`,[tenantId,customerId,code]);return r.rows[0];}
  async redeemReferral(tenantId:string,customerId:string,d:ReferralDto){const r=await this.db.query(`UPDATE commerce_referrals SET referred_customer_id=$2,status='REDEEMED',redeemed_at=now() WHERE tenant_id=$1 AND code=$3 AND status='ACTIVE' AND referrer_customer_id<>$2 RETURNING id,reward_amount AS "rewardAmount",currency,referrer_customer_id AS "referrerCustomerId"`,[tenantId,customerId,d.code]);return r.rows[0]??null;}
  async getLimits(tenantId:string,customerId:string){const r=await this.db.query(`INSERT INTO commerce_limits (tenant_id,customer_id) VALUES ($1,$2) ON CONFLICT (tenant_id,customer_id) DO UPDATE SET updated_at=now() RETURNING daily_amount AS "dailyAmount",daily_transactions AS "dailyTransactions",monthly_amount AS "monthlyAmount",require_verification_above AS "requireVerificationAbove"`,[tenantId,customerId]);return r.rows[0];}
  async setLimits(tenantId:string,customerId:string,d:LimitDto){const current=await this.getLimits(tenantId,customerId);const r=await this.db.query(`UPDATE commerce_limits SET daily_amount=COALESCE($3,daily_amount),daily_transactions=COALESCE($4,daily_transactions),monthly_amount=COALESCE($5,monthly_amount),require_verification_above=COALESCE($6,require_verification_above),updated_at=now() WHERE tenant_id=$1 AND customer_id=$2 RETURNING daily_amount AS "dailyAmount",daily_transactions AS "dailyTransactions",monthly_amount AS "monthlyAmount",require_verification_above AS "requireVerificationAbove"`,[tenantId,customerId,d.dailyAmount??null,d.dailyTransactions??null,d.monthlyAmount??null,d.requireVerificationAbove??null]);return r.rows[0]??current;}
  async listVerifications(tenantId:string,customerId:string){const r=await this.db.query(`SELECT verification_type AS "verificationType",status,verified_at AS "verifiedAt",evidence_ref AS "evidenceRef" FROM commerce_verifications WHERE tenant_id=$1 AND customer_id=$2 ORDER BY verification_type`,[tenantId,customerId]);return r.rows;}
  async setVerification(tenantId:string,customerId:string,d:VerificationDto){const r=await this.db.query(`INSERT INTO commerce_verifications (tenant_id,customer_id,verification_type,status,verified_at,evidence_ref) VALUES ($1,$2,$3,$4,CASE WHEN $4='VERIFIED' THEN now() ELSE NULL END,$5) ON CONFLICT (tenant_id,customer_id,verification_type) DO UPDATE SET status=EXCLUDED.status,verified_at=EXCLUDED.verified_at,evidence_ref=EXCLUDED.evidence_ref,updated_at=now() RETURNING verification_type AS "verificationType",status,verified_at AS "verifiedAt"`,[tenantId,customerId,d.verificationType,d.status,d.evidenceRef??null]);return r.rows[0];}
  async getPreferences(tenantId:string,customerId:string){const r=await this.db.query(`INSERT INTO commerce_notification_preferences (tenant_id,customer_id) VALUES ($1,$2) ON CONFLICT (tenant_id,customer_id) DO UPDATE SET updated_at=now() RETURNING transaction_alerts AS "transactionAlerts",access_alerts AS "accessAlerts",promotion_alerts AS "promotionAlerts",security_alerts AS "securityAlerts",preferred_channel AS "preferredChannel"`,[tenantId,customerId]);return r.rows[0];}
  async setPreferences(tenantId:string,customerId:string,d:NotificationPreferenceDto){const c=await this.getPreferences(tenantId,customerId);const r=await this.db.query(`UPDATE commerce_notification_preferences SET transaction_alerts=COALESCE($3,transaction_alerts),access_alerts=COALESCE($4,access_alerts),promotion_alerts=COALESCE($5,promotion_alerts),security_alerts=COALESCE($6,security_alerts),preferred_channel=COALESCE($7,preferred_channel),updated_at=now() WHERE tenant_id=$1 AND customer_id=$2 RETURNING transaction_alerts AS "transactionAlerts",access_alerts AS "accessAlerts",promotion_alerts AS "promotionAlerts",security_alerts AS "securityAlerts",preferred_channel AS "preferredChannel"`,[tenantId,customerId,d.transactionAlerts??null,d.accessAlerts??null,d.promotionAlerts??null,d.securityAlerts??null,d.preferredChannel??null]);return r.rows[0]??c;}
  async createSupport(tenantId:string,customerId:string,d:SupportCaseDto){const r=await this.db.query(`INSERT INTO commerce_support_cases (tenant_id,customer_id,category,subject,description,priority,purchase_id,payment_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,status,priority,created_at AS "createdAt"`,[tenantId,customerId,d.category,d.subject,d.description,d.priority??'NORMAL',d.purchaseId??null,d.paymentId??null]);return r.rows[0];}
  async listSupport(tenantId:string,customerId:string){const r=await this.db.query(`SELECT id,category,subject,description,status,priority,purchase_id AS "purchaseId",payment_id AS "paymentId",created_at AS "createdAt",updated_at AS "updatedAt",resolved_at AS "resolvedAt" FROM commerce_support_cases WHERE tenant_id=$1 AND customer_id=$2 ORDER BY created_at DESC LIMIT 100`,[tenantId,customerId]);return r.rows;}

  
  private async processDueRenewals() {
    const due=await this.db.query(`SELECT r.id,r.tenant_id AS "tenantId",r.customer_id AS "customerId",r.saved_purchase_id AS "savedPurchaseId",s.package_id AS "packageId",s.router_id AS "routerId",s.renewal_days AS "renewalDays" FROM commerce_renewal_schedules r JOIN commerce_saved_purchases s ON s.tenant_id=r.tenant_id AND s.id=r.saved_purchase_id WHERE r.status='ACTIVE' AND s.active=true AND s.auto_renew=true AND r.next_run_at<=now() ORDER BY r.next_run_at LIMIT 20`);
    for(const row of due.rows) {
      try {
        const wallet=await this.db.query(`SELECT id,balance,currency,status FROM customer_wallets WHERE tenant_id=$1 AND customer_id=$2 AND currency='TZS' FOR UPDATE`,[row.tenantId,row.customerId]);
        const plan=await this.db.query(`SELECT price,currency FROM packages WHERE tenant_id=$1 AND id=$2 AND is_active=true`,[row.tenantId,row.packageId]);
        if(!wallet.rowCount || wallet.rows[0].status!=='ACTIVE' || !plan.rowCount) throw new Error('Renewal prerequisites unavailable');
        const amount=Number(plan.rows[0].price);
        if(wallet.rows[0].currency!==plan.rows[0].currency || Number(wallet.rows[0].balance)<amount) throw new Error('Insufficient wallet balance or currency mismatch');
        const idem=`renewal:${row.id}:${new Date().toISOString().slice(0,10)}`;
        const existing=await this.db.query(`SELECT id FROM customer_wallet_entries WHERE tenant_id=$1 AND idempotency_key=$2`,[row.tenantId,idem]);
        if(existing.rowCount) { await this.db.query(`UPDATE commerce_renewal_schedules SET next_run_at=now()+make_interval(days=>GREATEST(1,$3)),last_run_at=now(),failure_count=0,updated_at=now() WHERE tenant_id=$1 AND id=$2`,[row.tenantId,row.id,Math.max(1,row.renewalDays||30)]); continue; }
        const purchase=await this.purchases.create(row.tenantId,{customerId:row.customerId,packageId:row.packageId,routerId:row.routerId});
        await this.db.query('BEGIN');
        try {
          const locked=await this.db.query(`SELECT id,balance FROM customer_wallets WHERE tenant_id=$1 AND customer_id=$2 AND currency=$3 FOR UPDATE`,[row.tenantId,row.customerId,plan.rows[0].currency]);
          if(!locked.rowCount || Number(locked.rows[0].balance)<amount) throw new Error('Wallet balance changed before debit');
          await this.db.query(`INSERT INTO customer_wallet_entries (tenant_id,wallet_id,entry_type,amount,currency,reference_type,reference_id,idempotency_key,description) VALUES ($1,$2,'PURCHASE',$3,$4,'WIFI_PLAN_PURCHASE',$5,$6,'Automatic renewal')`,[row.tenantId,locked.rows[0].id,amount,plan.rows[0].currency,purchase.id,idem]);
          await this.db.query(`UPDATE customer_wallets SET balance=balance-$3,updated_at=now() WHERE tenant_id=$1 AND id=$2`,[row.tenantId,locked.rows[0].id,amount]);
          await this.db.query('COMMIT');
        } catch(e) { await this.db.query('ROLLBACK').catch(()=>undefined); throw e; }
        await this.purchases.confirmPayment(row.tenantId,purchase.id,{provider:'manual',providerReference:`wallet-renewal:${row.id}:${purchase.id}`,status:'SUCCESS',idempotencyKey:`wallet-payment:${purchase.id}`});
        await this.db.query(`UPDATE commerce_renewal_schedules SET next_run_at=now()+make_interval(days=>GREATEST(1,$3)),last_run_at=now(),failure_count=0,updated_at=now() WHERE tenant_id=$1 AND id=$2`,[row.tenantId,row.id,Math.max(1,row.renewalDays||30)]);
      } catch {
        await this.db.query(`UPDATE commerce_renewal_schedules SET failure_count=failure_count+1,status=CASE WHEN failure_count+1>=5 THEN 'FAILED' ELSE status END,updated_at=now() WHERE tenant_id=$1 AND id=$2`,[row.tenantId,row.id]).catch(()=>undefined);
      }
    }
  }
}
