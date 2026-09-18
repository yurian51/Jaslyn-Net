import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { CreatePackageDto, ListPackagesQueryDto, UpdatePackageDto } from './packages.dto';

const selectColumns = `id, name, price, currency, duration_seconds AS "durationSeconds",
  data_limit_bytes AS "dataLimitBytes", download_bps AS "downloadBps", upload_bps AS "uploadBps",
  devices_per_code AS "devicesPerCode", show_on_portal AS "showOnPortal",
  is_free_trial AS "isFreeTrial", free_trial_frequency AS "freeTrialFrequency",
  is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt"`;

@Injectable()
export class PackagesService {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  async list(tenantId: string, query: ListPackagesQueryDto = new ListPackagesQueryDto()) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
    const offset = (page - 1) * limit;
    const search = query.search?.trim() || null;
    const activeOnly = query.activeOnly === true;
    const portalOnly = query.portalOnly === true;
    const result = await this.db.query(
      `SELECT ${selectColumns} FROM packages
       WHERE tenant_id=$1
         AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%')
         AND ($3::boolean = false OR is_active=true)
         AND ($4::boolean = false OR show_on_portal=true)
       ORDER BY created_at DESC LIMIT $5 OFFSET $6`,
      [tenantId, search, activeOnly, portalOnly, limit, offset],
    );
    const count = await this.db.query(
      `SELECT COUNT(*)::int AS count FROM packages
       WHERE tenant_id=$1 AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%')
       AND ($3::boolean=false OR is_active=true) AND ($4::boolean=false OR show_on_portal=true)`,
      [tenantId, search, activeOnly, portalOnly],
    );
    const total = count.rows[0]?.count ?? 0;
    return { data: result.rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async get(tenantId: string, id: string) {
    const result = await this.db.query(`SELECT ${selectColumns} FROM packages WHERE tenant_id=$1 AND id=$2`, [tenantId,id]);
    if (!result.rowCount) throw new NotFoundException('WiFi plan not found');
    return result.rows[0];
  }

  async create(tenantId: string, input: CreatePackageDto) {
    try {
      const result = await this.db.query(
        `INSERT INTO packages
         (tenant_id,name,price,currency,duration_seconds,data_limit_bytes,download_bps,upload_bps,devices_per_code,show_on_portal,is_free_trial,free_trial_frequency,is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING ${selectColumns}`,
        [tenantId,input.name.trim(),input.price,(input.currency??'TZS').trim().toUpperCase(),input.durationSeconds,
         input.dataLimitBytes??null,input.downloadBps??null,input.uploadBps??null,input.devicesPerCode??1,input.showOnPortal??true,
         input.isFreeTrial??false,input.freeTrialFrequency??'ONCE_PER_PHONE',input.isActive??true],
      );
      return result.rows[0];
    } catch(error:any) {
      if(error?.code==='23505') throw new ConflictException('WiFi plan already exists');
      throw error;
    }
  }

  async update(tenantId: string, id: string, input: UpdatePackageDto) {
    const current = await this.get(tenantId,id);
    const result = await this.db.query(
      `UPDATE packages SET name=$3,price=$4,currency=$5,duration_seconds=$6,data_limit_bytes=$7,download_bps=$8,upload_bps=$9,
       devices_per_code=$10,show_on_portal=$11,is_free_trial=$12,free_trial_frequency=$13,is_active=$14,updated_at=now()
       WHERE tenant_id=$1 AND id=$2 RETURNING ${selectColumns}`,
      [tenantId,id,input.name?.trim()??current.name,input.price??current.price,input.currency?.trim().toUpperCase()??current.currency,
       input.durationSeconds??current.durationSeconds,input.dataLimitBytes??current.dataLimitBytes,input.downloadBps??current.downloadBps,
       input.uploadBps??current.uploadBps,input.devicesPerCode??current.devicesPerCode,input.showOnPortal??current.showOnPortal,
       input.isFreeTrial??current.isFreeTrial,input.freeTrialFrequency??current.freeTrialFrequency,input.isActive??current.isActive],
    );
    return result.rows[0];
  }

  async deactivate(tenantId: string,id:string){ return this.update(tenantId,id,{isActive:false}); }
}
