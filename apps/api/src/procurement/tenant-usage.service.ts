import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { SetTenantUsageLimitDto } from './tenant-usage.dto';

const CUSTOM_METRICS=new Set(['inventory_items','suppliers','purchase_orders','api_keys','webhook_endpoints']);
@Injectable()
export class TenantUsageService {
  constructor(@Inject(PG_POOL) private readonly db:Pool,private readonly audit:AuditService){}
  private async counts(tenantId:string){
    const r=await this.db.query(`SELECT 'routers' AS metric_key,count(*)::bigint AS usage FROM routers WHERE tenant_id=$1
      UNION ALL SELECT 'sites',count(*)::bigint FROM sites WHERE tenant_id=$1
      UNION ALL SELECT 'customers',count(*)::bigint FROM customers WHERE tenant_id=$1
      UNION ALL SELECT 'inventory_items',count(*)::bigint FROM inventory_items WHERE tenant_id=$1 AND active=true
      UNION ALL SELECT 'suppliers',count(*)::bigint FROM suppliers WHERE tenant_id=$1 AND status='ACTIVE'
      UNION ALL SELECT 'purchase_orders',count(*)::bigint FROM purchase_orders WHERE tenant_id=$1
      UNION ALL SELECT 'api_keys',count(*)::bigint FROM platform_api_keys WHERE tenant_id=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())
      UNION ALL SELECT 'webhook_endpoints',count(*)::bigint FROM tenant_webhook_endpoints WHERE tenant_id=$1 AND enabled=true`,[tenantId]);
    return new Map<string,number>(r.rows.map(x=>[x.metric_key,Number(x.usage)]));
  }
  async overview(tenantId:string){
    const [counts,plan,custom,history]=await Promise.all([
      this.counts(tenantId),
      this.db.query(`SELECT p.max_routers AS routers,p.max_sites AS sites,p.max_customers AS customers,p.name AS plan_name
        FROM organization_subscriptions s JOIN saas_plans p ON p.id=s.saas_plan_id
        WHERE s.tenant_id=$1 AND s.status IN ('TRIALING','ACTIVE','PAST_DUE') ORDER BY s.created_at DESC LIMIT 1`,[tenantId]),
      this.db.query('SELECT metric_key,limit_count FROM tenant_usage_limits WHERE tenant_id=$1',[tenantId]),
      this.db.query('SELECT metric_key,period_start,usage_count FROM tenant_usage_counters WHERE tenant_id=$1 AND period_start>=CURRENT_DATE-30 ORDER BY period_start DESC,metric_key',[tenantId]),
    ]);
    const p=plan.rows[0]??{};const limits=new Map<string,number|null>([
      ['routers',p.routers===null||p.routers===undefined?null:Number(p.routers)],
      ['sites',p.sites===null||p.sites===undefined?null:Number(p.sites)],
      ['customers',p.customers===null||p.customers===undefined?null:Number(p.customers)],
    ]);
    for(const x of custom.rows)limits.set(x.metric_key,Number(x.limit_count));
    const metrics=[...counts.entries()].map(([metricKey,currentUsage])=>{const limit=limits.get(metricKey)??null;return {metricKey,currentUsage,limitCount:limit,remaining:limit===null?null:Math.max(0,limit-currentUsage),source:['routers','sites','customers'].includes(metricKey)?'subscription-plan':limits.has(metricKey)?'tenant-configured':'unlimited'};});
    return {planName:p.plan_name??null,metrics,historicalDailyUsage:history.rows};
  }
  async setLimit(tenantId:string,actorId:string,metricKey:string,d:SetTenantUsageLimitDto){
    if(!CUSTOM_METRICS.has(metricKey))throw new BadRequestException('Only custom tenant metrics can be configured here; router/site/customer caps come from the subscription plan');
    const counts=await this.counts(tenantId);const current=counts.get(metricKey)??0;
    if(d.limitCount<current)throw new ConflictException('Quota cannot be lower than current resource usage');
    const r=await this.db.query(`INSERT INTO tenant_usage_limits(tenant_id,metric_key,limit_count,updated_by,updated_at)
      VALUES($1,$2,$3,$4,now()) ON CONFLICT(tenant_id,metric_key) DO UPDATE SET limit_count=EXCLUDED.limit_count,updated_by=EXCLUDED.updated_by,updated_at=now()
      RETURNING metric_key AS "metricKey",limit_count AS "limitCount",updated_at AS "updatedAt"`,[tenantId,metricKey,d.limitCount,actorId]);
    await this.audit.record(tenantId,'SET_QUOTA','tenant_usage_limit',tenantId,{metricKey,limitCount:d.limitCount,currentUsage:current},{userId:actorId});
    return {...r.rows[0],currentUsage:current};
  }
  async listLimits(tenantId:string){const r=await this.db.query('SELECT metric_key AS "metricKey",limit_count AS "limitCount",updated_by AS "updatedBy",updated_at AS "updatedAt" FROM tenant_usage_limits WHERE tenant_id=$1 ORDER BY metric_key',[tenantId]);return {data:r.rows};}
}
