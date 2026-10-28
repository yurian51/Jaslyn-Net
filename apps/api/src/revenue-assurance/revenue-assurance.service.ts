import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditContext, AuditService } from '../audit/audit.service';
import { UpdateRevenueDiscrepancyDto } from './revenue-assurance.dto';

type Seed={category:string;severity:string;referenceType:string;referenceId:string;expectedAmount:string|null;actualAmount:string|null;currency:string|null;details:Record<string,unknown>};

@Injectable()
export class RevenueAssuranceService {
  constructor(@Inject(PG_POOL) private readonly db:Pool,private readonly audit:AuditService){}

  async runReconciliation(tenantId:string,actorUserId?:string,context:AuditContext={}){
    const client=await this.db.connect();
    try{
      await client.query('BEGIN');
      const run=await client.query(`INSERT INTO revenue_reconciliation_runs(tenant_id,status,created_by) VALUES($1,'RUNNING',$2) RETURNING id`,[tenantId,actorUserId??null]);
      const runId=run.rows[0].id as string;
      const [purchases,payments,entitlements]=await Promise.all([
        client.query('SELECT count(*)::int AS count FROM wifi_plan_purchases WHERE tenant_id=$1',[tenantId]),
        client.query('SELECT count(*)::int AS count FROM payments WHERE tenant_id=$1',[tenantId]),
        client.query('SELECT count(*)::int AS count FROM access_grants WHERE tenant_id=$1',[tenantId]),
      ]);
      const seeds:Seed[]=[];
      const checks=[
        `SELECT 'PURCHASE_WITHOUT_PAID_PAYMENT' category,'HIGH' severity,'PURCHASE' "referenceType",p.id "referenceId",p.price::text "expectedAmount",NULL::text "actualAmount",p.currency,
          jsonb_build_object('purchaseStatus',p.status,'customerId',p.customer_id,'packageId',p.package_id) details
         FROM wifi_plan_purchases p WHERE p.tenant_id=$1 AND p.status IN ('PAID','ACTIVE')
           AND NOT EXISTS(SELECT 1 FROM payments pay WHERE pay.tenant_id=p.tenant_id AND pay.purchase_id=p.id AND pay.status='PAID')`,
        `SELECT 'ACTIVE_PURCHASE_WITHOUT_ACTIVE_ENTITLEMENT' category,'HIGH' severity,'PURCHASE' "referenceType",p.id "referenceId",p.price::text "expectedAmount",NULL::text "actualAmount",p.currency,
          jsonb_build_object('purchaseStatus',p.status,'endsAt',p.ends_at) details
         FROM wifi_plan_purchases p WHERE p.tenant_id=$1 AND p.status='ACTIVE'
           AND NOT EXISTS(SELECT 1 FROM access_grants ag WHERE ag.tenant_id=p.tenant_id AND ag.purchase_id=p.id AND ag.status='ACTIVE' AND (ag.ends_at IS NULL OR ag.ends_at>now()))`,
        `SELECT 'ACTIVE_ENTITLEMENT_WITH_INACTIVE_PURCHASE' category,'HIGH' severity,'ENTITLEMENT' "referenceType",ag.id "referenceId",NULL::text "expectedAmount",NULL::text "actualAmount",p.currency,
          jsonb_build_object('entitlementStatus',ag.status,'purchaseStatus',p.status,'entitlementEndsAt',ag.ends_at,'purchaseId',p.id) details
         FROM access_grants ag JOIN wifi_plan_purchases p ON p.tenant_id=ag.tenant_id AND p.id=ag.purchase_id
         WHERE ag.tenant_id=$1 AND ag.status='ACTIVE' AND (p.status NOT IN ('PAID','ACTIVE') OR ag.ends_at<=now())`,
        `SELECT 'DUPLICATE_PAID_PAYMENTS' category,'HIGH' severity,'PURCHASE' "referenceType",p.id "referenceId",p.price::text "expectedAmount",sum(pay.amount)::text "actualAmount",p.currency,
          jsonb_build_object('paidPaymentCount',count(pay.id),'paymentIds',jsonb_agg(pay.id),'paidTotal',sum(pay.amount)) details
         FROM wifi_plan_purchases p JOIN payments pay ON pay.tenant_id=p.tenant_id AND pay.purchase_id=p.id AND pay.status='PAID'
         WHERE p.tenant_id=$1 GROUP BY p.id HAVING count(pay.id)>1`,
        `SELECT 'PAYMENT_AMOUNT_OR_CURRENCY_MISMATCH' category,'HIGH' severity,'PAYMENT' "referenceType",pay.id "referenceId",p.price::text "expectedAmount",pay.amount::text "actualAmount",pay.currency,
          jsonb_build_object('purchaseId',p.id,'purchaseCurrency',p.currency,'paymentCurrency',pay.currency,'purchasePrice',p.price,'paymentAmount',pay.amount) details
         FROM payments pay JOIN wifi_plan_purchases p ON p.tenant_id=pay.tenant_id AND p.id=pay.purchase_id
         WHERE pay.tenant_id=$1 AND pay.status='PAID' AND (pay.amount<>p.price OR pay.currency<>p.currency)`,
        `SELECT 'PAID_PAYMENT_MISSING_LEDGER_POSTING' category,'HIGH' severity,'PAYMENT' "referenceType",pay.id "referenceId",pay.amount::text "expectedAmount",NULL::text "actualAmount",pay.currency,
          jsonb_build_object('provider',pay.provider,'providerReference',pay.provider_reference,'paymentStatus',pay.status) details
         FROM payments pay WHERE pay.tenant_id=$1 AND pay.status='PAID'
           AND NOT EXISTS(SELECT 1 FROM financial_ledger_transactions t WHERE t.tenant_id=pay.tenant_id AND t.transaction_type='PAYMENT' AND t.reference_type='PAYMENT' AND t.reference_id=pay.id)`,
        `SELECT 'UNBALANCED_LEDGER_TRANSACTION' category,'HIGH' severity,'LEDGER_TRANSACTION' "referenceType",t.id "referenceId",NULL::text "expectedAmount",NULL::text "actualAmount",NULL::char(3) currency,
          jsonb_build_object('transactionType',t.transaction_type,'referenceType',t.reference_type,'referenceId',t.reference_id,
            'unbalancedCurrencies',jsonb_agg(jsonb_build_object('currency',x.currency,'debits',x.debits,'credits',x.credits))) details
         FROM financial_ledger_transactions t JOIN (
           SELECT tenant_id,transaction_id,currency,sum(debit) debits,sum(credit) credits
           FROM financial_ledger_entries GROUP BY tenant_id,transaction_id,currency
         ) x ON x.tenant_id=t.tenant_id AND x.transaction_id=t.id
         WHERE t.tenant_id=$1 GROUP BY t.id HAVING bool_or(x.debits<>x.credits)`,
      ];
      for(const sql of checks){const r=await client.query<Seed>(sql,[tenantId]);seeds.push(...r.rows);}
      for(const seed of seeds){
        const accepted=await client.query(`SELECT id FROM revenue_reconciliation_discrepancies WHERE tenant_id=$1 AND category=$2 AND reference_type=$3 AND reference_id=$4 AND status='ACCEPTED' FOR UPDATE`,[tenantId,seed.category,seed.referenceType,seed.referenceId]);
        if(accepted.rowCount){
          await client.query(`UPDATE revenue_reconciliation_discrepancies SET last_seen_run_id=$2,last_seen_at=now(),occurrences=occurrences+1,details=$3::jsonb WHERE tenant_id=$1 AND id=$4`,[tenantId,runId,JSON.stringify(seed.details),accepted.rows[0].id]);
          continue;
        }
        await client.query(
          `INSERT INTO revenue_reconciliation_discrepancies
            (tenant_id,category,severity,reference_type,reference_id,first_seen_run_id,last_seen_run_id,expected_amount,actual_amount,currency,details)
           VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10::jsonb)
           ON CONFLICT (tenant_id,category,reference_type,reference_id) WHERE status='OPEN'
           DO UPDATE SET last_seen_run_id=EXCLUDED.last_seen_run_id,last_seen_at=now(),occurrences=revenue_reconciliation_discrepancies.occurrences+1,
             expected_amount=EXCLUDED.expected_amount,actual_amount=EXCLUDED.actual_amount,currency=EXCLUDED.currency,details=EXCLUDED.details`,
          [tenantId,seed.category,seed.severity,seed.referenceType,seed.referenceId,runId,seed.expectedAmount,seed.actualAmount,seed.currency,JSON.stringify(seed.details)],
        );
      }
      await client.query(`UPDATE revenue_reconciliation_discrepancies SET status='RESOLVED',resolved_at=now(),resolution_note='Not detected in the latest completed reconciliation run' WHERE tenant_id=$1 AND status='OPEN' AND last_seen_run_id<>$2`,[tenantId,runId]);
      const counts=await client.query(`SELECT count(*)::int AS open_count FROM revenue_reconciliation_discrepancies WHERE tenant_id=$1 AND status='OPEN' AND last_seen_run_id=$2`,[tenantId,runId]);
      const completed=await client.query(`UPDATE revenue_reconciliation_runs SET status='COMPLETED',checked_purchases=$3,checked_payments=$4,checked_entitlements=$5,discrepancies_found=$6,completed_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status,checked_purchases AS "checkedPurchases",checked_payments AS "checkedPayments",checked_entitlements AS "checkedEntitlements",discrepancies_found AS "discrepanciesFound",started_at AS "startedAt",completed_at AS "completedAt"`,[tenantId,runId,purchases.rows[0].count,payments.rows[0].count,entitlements.rows[0].count,counts.rows[0].open_count]);
      await client.query(`INSERT INTO audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,correlation_id,ip_address,user_agent,metadata) VALUES($1,$2,'REVENUE_RECONCILIATION_COMPLETED','revenue_reconciliation_run',$3,$4,$5,$6,$7,$8::jsonb)`,[tenantId,actorUserId??null,runId,context.requestId??null,context.correlationId??null,context.ipAddress??null,context.userAgent??null,JSON.stringify({discrepanciesFound:counts.rows[0].open_count,checkedPurchases:purchases.rows[0].count,checkedPayments:payments.rows[0].count,checkedEntitlements:entitlements.rows[0].count})]);
      await client.query('COMMIT');return completed.rows[0];
    }catch(e){await client.query('ROLLBACK').catch(()=>undefined);throw e;}finally{client.release();}
  }

  async runAllTenantReconciliations(){const tenants=await this.db.query("SELECT id FROM tenants WHERE status NOT IN ('ARCHIVED','SUSPENDED') ORDER BY id");const results=[];for(const t of tenants.rows){try{results.push(await this.runReconciliation(t.id));}catch(e){results.push({tenantId:t.id,status:'FAILED',error:e instanceof Error?e.message:'Unknown error'});}}return results;}

  async listRuns(tenantId:string){const r=await this.db.query(`SELECT id,status,checked_purchases AS "checkedPurchases",checked_payments AS "checkedPayments",checked_entitlements AS "checkedEntitlements",discrepancies_found AS "discrepanciesFound",started_at AS "startedAt",completed_at AS "completedAt",error FROM revenue_reconciliation_runs WHERE tenant_id=$1 ORDER BY started_at DESC LIMIT 100`,[tenantId]);return {data:r.rows,count:r.rowCount??0};}
  async listDiscrepancies(tenantId:string,status?:string){const r=await this.db.query(`SELECT id,category,severity,reference_type AS "referenceType",reference_id AS "referenceId",first_seen_run_id AS "firstSeenRunId",last_seen_run_id AS "lastSeenRunId",occurrences,expected_amount AS "expectedAmount",actual_amount AS "actualAmount",currency,details,status,resolution_note AS "resolutionNote",created_at AS "createdAt",last_seen_at AS "lastSeenAt",resolved_at AS "resolvedAt" FROM revenue_reconciliation_discrepancies WHERE tenant_id=$1 AND ($2::text IS NULL OR status=$2) ORDER BY CASE severity WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 WHEN 'LOW' THEN 2 ELSE 3 END,last_seen_at DESC LIMIT 500`,[tenantId,status??null]);return {data:r.rows,count:r.rowCount??0};}
  async updateDiscrepancy(tenantId:string,actorUserId:string,id:string,input:UpdateRevenueDiscrepancyDto,context:AuditContext={}){
    if(input.status==='ACCEPTED'&&!input.note?.trim())throw new BadRequestException('A reason is required when accepting a revenue discrepancy');
    const r=await this.db.query(`UPDATE revenue_reconciliation_discrepancies SET status=$3,resolution_note=$4,resolved_at=CASE WHEN $3='RESOLVED' THEN now() ELSE NULL END WHERE tenant_id=$1 AND id=$2 AND status='OPEN' RETURNING id,status,resolution_note AS "resolutionNote",resolved_at AS "resolvedAt"`,[tenantId,id,input.status,input.note?.trim()||null]);
    if(!r.rowCount)throw new NotFoundException('Open revenue discrepancy not found');await this.audit.record(tenantId,'REVENUE_DISCREPANCY_'+input.status,'revenue_discrepancy',id,{noteProvided:Boolean(input.note)},context);return r.rows[0];
  }
}
