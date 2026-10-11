import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { CreateNetworkTelemetryDto, CreatePowerSampleDto, CreateSlaPolicyDto, CreateWifiExperienceDto, UpsertDeviceLifecycleDto } from './operations-intelligence.dto';

@Injectable()
export class OperationsIntelligenceService {
  constructor(@Inject(PG_POOL) private readonly db:Pool,private readonly audit:AuditService){}
  private async auditChange(tenantId:string,actorId:string,action:string,type:string,id:string,metadata:Record<string,unknown>={}){
    await this.audit.record(tenantId,action,type,id,metadata,{userId:actorId});
  }
  async ingestNetworkSample(tenantId:string,d:CreateNetworkTelemetryDto){
    if(!Number.isFinite(d.metricValue))throw new BadRequestException('Metric value must be finite');
    if(['PACKET_LOSS_PCT','UTILIZATION_PCT','CHANNEL_UTILIZATION_PCT','AIRTIME_PCT'].includes(d.metricType)&&(d.metricValue<0||d.metricValue>100))throw new BadRequestException('Percentage metrics must be between 0 and 100');
    const r=await this.db.query(`INSERT INTO network_telemetry_samples(tenant_id,resource_type,resource_id,metric_type,metric_value,unit,source,sampled_at,idempotency_key)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(tenant_id,idempotency_key) DO NOTHING RETURNING *`,
      [tenantId,d.resourceType,d.resourceId,d.metricType,d.metricValue,d.unit,d.source,d.sampledAt,d.idempotencyKey]);
    if(r.rowCount)return {duplicate:false,data:r.rows[0]};
    const old=await this.db.query('SELECT * FROM network_telemetry_samples WHERE tenant_id=$1 AND idempotency_key=$2',[tenantId,d.idempotencyKey]);
    if(!old.rowCount)throw new ConflictException('Telemetry sample could not be resolved after idempotency conflict');
    const x=old.rows[0];if(x.resource_id!==d.resourceId||x.metric_type!==d.metricType||Number(x.metric_value)!==d.metricValue)throw new ConflictException('Idempotency key is already bound to a different telemetry sample');
    return {duplicate:true,data:x};
  }
  async ingestWifiSample(tenantId:string,d:CreateWifiExperienceDto){
    const r=await this.db.query(`INSERT INTO wifi_client_experience_samples(tenant_id,router_id,client_key_hash,ssid,band,channel,rssi_dbm,noise_dbm,airtime_pct,channel_utilization_pct,tx_rate_bps,rx_rate_bps,roaming_count,sampled_at,idempotency_key)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT(tenant_id,idempotency_key) DO NOTHING RETURNING id,router_id,band,channel,rssi_dbm,noise_dbm,airtime_pct,channel_utilization_pct,tx_rate_bps,rx_rate_bps,roaming_count,sampled_at`,
      [tenantId,d.routerId,d.clientKeyHash.toLowerCase(),d.ssid??null,d.band??'UNKNOWN',d.channel??null,d.rssiDbm??null,d.noiseDbm??null,d.airtimePct??null,d.channelUtilizationPct??null,d.txRateBps??null,d.rxRateBps??null,d.roamingCount??0,d.sampledAt,d.idempotencyKey]);
    if(r.rowCount)return {duplicate:false,data:r.rows[0]};
    const old=await this.db.query('SELECT id,router_id,client_key_hash,channel_utilization_pct,sampled_at FROM wifi_client_experience_samples WHERE tenant_id=$1 AND idempotency_key=$2',[tenantId,d.idempotencyKey]);
    if(!old.rowCount)throw new ConflictException('Wi-Fi sample could not be resolved after idempotency conflict');
    if(old.rows[0].router_id!==d.routerId||old.rows[0].client_key_hash!==d.clientKeyHash.toLowerCase())throw new ConflictException('Idempotency key is already bound to a different Wi-Fi sample');
    return {duplicate:true,data:old.rows[0]};
  }
  async wifiExperience(tenantId:string){
    const r=await this.db.query(`SELECT router_id AS "routerId",count(DISTINCT client_key_hash)::int AS "uniqueClients",
      round(avg(rssi_dbm),1) AS "averageRssiDbm",round(avg(channel_utilization_pct),1) AS "averageChannelUtilizationPct",
      round(avg(airtime_pct),1) AS "averageAirtimePct",sum(roaming_count)::int AS "roamingEvents",max(sampled_at) AS "lastSampleAt"
      FROM wifi_client_experience_samples WHERE tenant_id=$1 AND sampled_at>=now()-interval '24 hours'
      GROUP BY router_id ORDER BY "uniqueClients" DESC LIMIT 500`,[tenantId]);
    return {data:r.rows};
  }
  async capacityForecast(tenantId:string){
    const r=await this.db.query(`SELECT resource_type,resource_id,metric_value,sampled_at FROM network_telemetry_samples
      WHERE tenant_id=$1 AND metric_type IN ('UTILIZATION_PCT','CHANNEL_UTILIZATION_PCT') AND sampled_at>=now()-interval '30 days'
      ORDER BY sampled_at ASC LIMIT 20000`,[tenantId]);
    const groups=new Map<string,{type:string;id:string;points:{x:number;y:number}[]}>();
    for(const row of r.rows){const key=row.resource_type+':'+row.resource_id;const g=groups.get(key)??{type:row.resource_type,id:row.resource_id,points:[]};g.points.push({x:new Date(row.sampled_at).getTime()/86400000,y:Number(row.metric_value)});groups.set(key,g);}
    const data=[...groups.values()].map(g=>{
      const pts=g.points;const n=pts.length;const first=pts[0];const last=pts[n-1];
      if(n<3||!first||!last)return {resourceType:g.type,resourceId:g.id,samples:n,currentUtilizationPct:last?.y??null,projected30DayPct:null,trend:'INSUFFICIENT_DATA'};
      const meanX=pts.reduce((s,p)=>s+p.x,0)/n,meanY=pts.reduce((s,p)=>s+p.y,0)/n;
      const denom=pts.reduce((s,p)=>s+(p.x-meanX)**2,0);const slope=denom?pts.reduce((s,p)=>s+(p.x-meanX)*(p.y-meanY),0)/denom:0;
      const projected=Math.max(0,Math.min(100,last.y+slope*30));
      return {resourceType:g.type,resourceId:g.id,samples:n,currentUtilizationPct:last.y,dailyChangePct:Number(slope.toFixed(3)),projected30DayPct:Number(projected.toFixed(2)),trend:slope>0.1?'INCREASING':slope< -0.1?'DECREASING':'STABLE',estimatedDaysTo80Pct:slope>0&&last.y<80?Number(((80-last.y)/slope).toFixed(1)):null};
    });
    return {method:'30-day linear regression; deterministic, not AI',data};
  }
  async ingestPowerSample(tenantId:string,d:CreatePowerSampleDto){
    if(!Number.isFinite(d.metricValue))throw new BadRequestException('Metric value must be finite');
    if(['UPS_BATTERY_PCT','UPS_LOAD_PCT','HUMIDITY_PCT'].includes(d.metricType)&&(d.metricValue<0||d.metricValue>100))throw new BadRequestException('Percentage metric must be between 0 and 100');
    const r=await this.db.query(`INSERT INTO power_environment_samples(tenant_id,site_id,asset_id,metric_type,metric_value,unit,source,sampled_at,idempotency_key)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(tenant_id,idempotency_key) DO NOTHING RETURNING *`,
      [tenantId,d.siteId??null,d.assetId??null,d.metricType,d.metricValue,d.unit,d.source,d.sampledAt,d.idempotencyKey]);
    if(r.rowCount)return {duplicate:false,data:r.rows[0]};
    const old=await this.db.query('SELECT id,metric_type,metric_value,asset_id FROM power_environment_samples WHERE tenant_id=$1 AND idempotency_key=$2',[tenantId,d.idempotencyKey]);
    if(!old.rowCount)throw new ConflictException('Power sample could not be resolved after idempotency conflict');
    if(old.rows[0].metric_type!==d.metricType||Number(old.rows[0].metric_value)!==d.metricValue)throw new ConflictException('Idempotency key is already bound to a different power sample');
    return {duplicate:true,data:old.rows[0]};
  }
  async powerStatus(tenantId:string){
    const r=await this.db.query(`SELECT DISTINCT ON (COALESCE(site_id::text,''),COALESCE(asset_id::text,''),metric_type)
      id,site_id AS "siteId",asset_id AS "assetId",metric_type AS "metricType",metric_value AS "metricValue",unit,source,sampled_at AS "sampledAt"
      FROM power_environment_samples WHERE tenant_id=$1 ORDER BY COALESCE(site_id::text,''),COALESCE(asset_id::text,''),metric_type,sampled_at DESC LIMIT 1000`,[tenantId]);
    return {data:r.rows};
  }
  async listLifecycle(tenantId:string){
    const r=await this.db.query(`SELECT * FROM device_lifecycle_records WHERE tenant_id=$1 ORDER BY end_of_support_at NULLS LAST,vendor,model LIMIT 1000`,[tenantId]);return {data:r.rows};
  }
  async upsertLifecycle(tenantId:string,actorId:string,d:UpsertDeviceLifecycleDto){
    if(d.endOfSupportAt&&d.endOfSaleAt&&new Date(d.endOfSupportAt)<new Date(d.endOfSaleAt))throw new BadRequestException('End-of-support cannot precede end-of-sale');
    const r=await this.db.query(`INSERT INTO device_lifecycle_records(tenant_id,resource_type,resource_id,vendor,model,serial_number,firmware_version,purchased_at,warranty_expires_at,end_of_sale_at,end_of_support_at,vulnerability_status,notes,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::date,$9::date,$10::date,$11::date,$12,$13,$14)
      ON CONFLICT(tenant_id,resource_type,resource_id) DO UPDATE SET vendor=EXCLUDED.vendor,model=EXCLUDED.model,serial_number=EXCLUDED.serial_number,firmware_version=EXCLUDED.firmware_version,purchased_at=EXCLUDED.purchased_at,warranty_expires_at=EXCLUDED.warranty_expires_at,end_of_sale_at=EXCLUDED.end_of_sale_at,end_of_support_at=EXCLUDED.end_of_support_at,vulnerability_status=EXCLUDED.vulnerability_status,notes=EXCLUDED.notes,updated_by=EXCLUDED.updated_by,updated_at=now()
      RETURNING *`,[tenantId,d.resourceType,d.resourceId,d.vendor.trim(),d.model.trim(),d.serialNumber??null,d.firmwareVersion??null,d.purchasedAt??null,d.warrantyExpiresAt??null,d.endOfSaleAt??null,d.endOfSupportAt??null,d.vulnerabilityStatus??'UNKNOWN',d.notes??null,actorId]);
    await this.auditChange(tenantId,actorId,'UPSERT','device_lifecycle',r.rows[0].id,{resourceType:d.resourceType,resourceId:d.resourceId,vulnerabilityStatus:r.rows[0].vulnerability_status,endOfSupportAt:r.rows[0].end_of_support_at});return r.rows[0];
  }
  async listSlaPolicies(tenantId:string){
    const r=await this.db.query(`SELECT * FROM service_sla_policies WHERE tenant_id=$1 ORDER BY active DESC,name`,[tenantId]);return {data:r.rows};
  }
  async createSlaPolicy(tenantId:string,actorId:string,d:CreateSlaPolicyDto){
    if(d.resolutionMinutes<d.responseMinutes)throw new BadRequestException('Resolution target must be at least the response target');
    const r=await this.db.query(`INSERT INTO service_sla_policies(tenant_id,name,service_code,target_uptime_pct,response_minutes,resolution_minutes,service_credit_pct,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[tenantId,d.name.trim(),d.serviceCode?.trim()||null,d.targetUptimePct,d.responseMinutes,d.resolutionMinutes,d.serviceCreditPct??0,actorId]);
    await this.auditChange(tenantId,actorId,'CREATE','service_sla_policy',r.rows[0].id,{name:d.name,targetUptimePct:d.targetUptimePct});return r.rows[0];
  }
}
