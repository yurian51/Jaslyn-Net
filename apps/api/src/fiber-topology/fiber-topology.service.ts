import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditContext, AuditService } from '../audit/audit.service';
import { CreateFiberAssetDto, UpdateFiberAssetDto } from './fiber-topology.dto';

@Injectable()
export class FiberTopologyService {
  constructor(@Inject(PG_POOL) private readonly db: Pool, private readonly audit: AuditService) {}

  async list(tenantId: string, filters: { assetType?: string; status?: string } = {}) {
    const result = await this.db.query(
      `SELECT a.id, a.asset_type AS "assetType", a.name, a.asset_code AS "assetCode",
        a.status, a.latitude, a.longitude, a.parent_asset_id AS "parentAssetId",
        p.name AS "parentAssetName", a.router_id AS "routerId", r.name AS "routerName",
        a.vendor, a.model, a.serial_number AS "serialNumber", a.metadata,
        a.created_at AS "createdAt", a.updated_at AS "updatedAt"
       FROM fiber_network_assets a
       LEFT JOIN fiber_network_assets p ON p.tenant_id=a.tenant_id AND p.id=a.parent_asset_id
       LEFT JOIN routers r ON r.tenant_id=a.tenant_id AND r.id=a.router_id
       WHERE a.tenant_id=$1 AND ($2::text IS NULL OR a.asset_type=$2)
         AND ($3::text IS NULL OR a.status=$3)
       ORDER BY a.updated_at DESC LIMIT 2000`,
      [tenantId, filters.assetType ?? null, filters.status ?? null],
    );
    return { data: result.rows };
  }

  async create(tenantId: string, actorId: string, input: CreateFiberAssetDto, context: AuditContext = {}) {
    const code = input.assetCode.trim();
    const existing = await this.db.query('SELECT id FROM fiber_network_assets WHERE tenant_id=$1 AND lower(asset_code)=lower($2)', [tenantId, code]);
    if (existing.rowCount) throw new ConflictException('An asset with this code already exists in this tenant');
    await this.validateRelationships(tenantId, input.parentAssetId, input.routerId);
    if ((input.latitude == null) !== (input.longitude == null)) throw new BadRequestException('Latitude and longitude must be provided together');
    const result = await this.db.query(
      `INSERT INTO fiber_network_assets
       (tenant_id,asset_type,name,asset_code,status,latitude,longitude,parent_asset_id,router_id,vendor,model,serial_number,metadata,created_by,updated_by)
       VALUES ($1,$2,$3,$4,COALESCE($5,'PLANNED'),$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$14)
       RETURNING id,asset_type AS "assetType",name,asset_code AS "assetCode",status,latitude,longitude,
        parent_asset_id AS "parentAssetId",router_id AS "routerId",vendor,model,serial_number AS "serialNumber",metadata,created_at AS "createdAt",updated_at AS "updatedAt"`,
      [tenantId,input.assetType,input.name.trim(),code,input.status??null,input.latitude??null,input.longitude??null,input.parentAssetId??null,input.routerId??null,input.vendor?.trim()||null,input.model?.trim()||null,input.serialNumber?.trim()||null,JSON.stringify(input.metadata??{}),actorId],
    );
    const asset = result.rows[0];
    await this.audit.record(tenantId,'FIBER_ASSET_CREATED','fiber_network_asset',asset.id,{assetType:asset.assetType,assetCode:asset.assetCode,status:asset.status},context);
    return asset;
  }

  async update(tenantId: string, actorId: string, id: string, input: UpdateFiberAssetDto, context: AuditContext = {}) {
    const current = await this.db.query('SELECT id,latitude,longitude,parent_asset_id AS "parentAssetId",router_id AS "routerId" FROM fiber_network_assets WHERE tenant_id=$1 AND id=$2',[tenantId,id]);
    if (!current.rowCount) throw new NotFoundException('Fiber asset not found');
    const row=current.rows[0];
    const parent = input.parentAssetId === undefined ? row.parentAssetId : input.parentAssetId;
    const router = input.routerId === undefined ? row.routerId : input.routerId;
    await this.validateRelationships(tenantId,parent,router,id);
    const lat = input.latitude === undefined ? row.latitude : input.latitude;
    const lon = input.longitude === undefined ? row.longitude : input.longitude;
    if ((lat == null) !== (lon == null)) throw new BadRequestException('Latitude and longitude must be provided together');
    const result = await this.db.query(
      `UPDATE fiber_network_assets SET name=COALESCE($3,name),status=COALESCE($4,status),
       latitude=$5,longitude=$6,parent_asset_id=$7,router_id=$8,
       vendor=CASE WHEN $9::boolean THEN $10 ELSE vendor END,
       model=CASE WHEN $11::boolean THEN $12 ELSE model END,
       serial_number=CASE WHEN $13::boolean THEN $14 ELSE serial_number END,
       metadata=COALESCE($15::jsonb,metadata),updated_by=$16
       WHERE tenant_id=$1 AND id=$2
       RETURNING id,asset_type AS "assetType",name,asset_code AS "assetCode",status,latitude,longitude,
       parent_asset_id AS "parentAssetId",router_id AS "routerId",vendor,model,serial_number AS "serialNumber",metadata,created_at AS "createdAt",updated_at AS "updatedAt"`,
      [tenantId,id,input.name?.trim()??null,input.status??null,lat,lon,parent,router,
       input.vendor!==undefined,input.vendor??null,input.model!==undefined,input.model??null,
       input.serialNumber!==undefined,input.serialNumber??null,input.metadata==null?null:JSON.stringify(input.metadata),actorId],
    );
    const asset=result.rows[0];
    await this.audit.record(tenantId,'FIBER_ASSET_UPDATED','fiber_network_asset',id,{changedFields:Object.keys(input)},context);
    return asset;
  }

  private async validateRelationships(tenantId: string, parentAssetId?: string | null, routerId?: string | null, currentId?: string) {
    if(parentAssetId){
      if(parentAssetId===currentId) throw new BadRequestException('An asset cannot be its own parent');
      const parent=await this.db.query('SELECT id FROM fiber_network_assets WHERE tenant_id=$1 AND id=$2',[tenantId,parentAssetId]);
      if(!parent.rowCount) throw new NotFoundException('Parent fiber asset not found in this tenant');
      let ancestor=parentAssetId;
      for(let depth=0;depth<100;depth++){
        if(ancestor===currentId) throw new BadRequestException('Fiber topology cannot contain a parent cycle');
        const next=await this.db.query('SELECT parent_asset_id FROM fiber_network_assets WHERE tenant_id=$1 AND id=$2',[tenantId,ancestor]);
        if(!next.rowCount || !next.rows[0].parent_asset_id) break;
        ancestor=next.rows[0].parent_asset_id;
        if(depth===99) throw new BadRequestException('Fiber topology exceeds the maximum parent depth');
      }
    }
    if(routerId){
      const router=await this.db.query('SELECT id FROM routers WHERE tenant_id=$1 AND id=$2',[tenantId,routerId]);
      if(!router.rowCount) throw new NotFoundException('Linked router not found in this tenant');
    }
  }
}
