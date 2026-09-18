import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { AddIpAddressDto, AllocateIpAddressDto, CreateIpamPoolDto, ListIpAddressesQueryDto } from './ipam.dto';

@Injectable()
export class IpamService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly audit: AuditService,
  ) {}

  async listPools(tenantId: string) {
    const result = await this.db.query(
      `SELECT p.id,p.name,p.network::text AS network,host(p.gateway) AS gateway,p.role,p.allocation_mode AS "allocationMode",
              p.vlan_id AS "vlanId",p.description,p.enabled,p.created_at AS "createdAt",p.updated_at AS "updatedAt",
              COUNT(a.id)::int AS "addressCount",
              COUNT(a.id) FILTER (WHERE a.status='AVAILABLE')::int AS "availableCount",
              COUNT(a.id) FILTER (WHERE a.status='ALLOCATED')::int AS "allocatedCount",
              COUNT(a.id) FILTER (WHERE a.status='RESERVED')::int AS "reservedCount"
       FROM ipam_pools p
       LEFT JOIN ipam_addresses a ON a.tenant_id=p.tenant_id AND a.pool_id=p.id
       WHERE p.tenant_id=$1
       GROUP BY p.id
       ORDER BY p.name`,
      [tenantId],
    );
    return { data: result.rows };
  }

  async getPool(tenantId: string, id: string) {
    const result = await this.db.query(
      `SELECT p.id,p.name,p.network::text AS network,host(p.gateway) AS gateway,p.role,p.allocation_mode AS "allocationMode",
              p.vlan_id AS "vlanId",p.description,p.enabled,
              COUNT(a.id)::int AS "addressCount",
              COUNT(a.id) FILTER (WHERE a.status='AVAILABLE')::int AS "availableCount",
              COUNT(a.id) FILTER (WHERE a.status='ALLOCATED')::int AS "allocatedCount",
              COUNT(a.id) FILTER (WHERE a.status='RESERVED')::int AS "reservedCount"
       FROM ipam_pools p
       LEFT JOIN ipam_addresses a ON a.tenant_id=p.tenant_id AND a.pool_id=p.id
       WHERE p.tenant_id=$1 AND p.id=$2
       GROUP BY p.id`,
      [tenantId, id],
    );
    if (!result.rowCount) throw new NotFoundException('IPAM pool not found');
    return result.rows[0];
  }

  async createPool(tenantId: string, dto: CreateIpamPoolDto) {
    const network = dto.network.trim();
    const overlap = await this.db.query(
      `SELECT id,name,network::text AS network FROM ipam_pools
       WHERE tenant_id=$1 AND network && $2::cidr
       LIMIT 1`,
      [tenantId, network],
    );
    if (overlap.rowCount) throw new ConflictException(`IPAM network overlaps existing pool ${overlap.rows[0].name} (${overlap.rows[0].network})`);

    if (dto.gateway) {
      const gateway = await this.db.query(
        `SELECT ($2::inet <<= network) AS contained FROM ipam_pools WHERE tenant_id=$1 AND false`,
        [tenantId, dto.gateway],
      );
      void gateway;
      try {
        const validation = await this.db.query(`SELECT ($1::inet <<= $2::cidr) AS contained`, [dto.gateway, network]);
        if (!validation.rows[0].contained) throw new BadRequestException('Gateway must belong to the pool network');
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        throw new BadRequestException('Invalid gateway or network');
      }
    }

    try {
      const result = await this.db.query(
        `INSERT INTO ipam_pools (tenant_id,name,network,gateway,role,allocation_mode,vlan_id,description,enabled)
         VALUES ($1,$2,$3::cidr,$4::inet,$5,$6,$7,$8,$9)
         RETURNING id,name,network::text AS network,host(gateway) AS gateway,role,allocation_mode AS "allocationMode",
                   vlan_id AS "vlanId",description,enabled,created_at AS "createdAt",updated_at AS "updatedAt"`,
        [tenantId,dto.name.trim(),network,dto.gateway ?? null,dto.role ?? 'CUSTOMER',dto.allocationMode ?? 'INVENTORY',
         dto.vlanId ?? null,dto.description?.trim() || null,dto.enabled ?? true],
      );
      await this.audit.record(tenantId, 'IPAM_POOL_CREATED', 'ipam_pool', result.rows[0].id, {
        name: result.rows[0].name, network: result.rows[0].network, role: result.rows[0].role,
      });
      return result.rows[0];
    } catch (error: unknown) {
      if ((error as { code?: string }).code === '22P02') throw new BadRequestException('Invalid CIDR, gateway, or IP address');
      if ((error as { code?: string }).code === '23505') throw new ConflictException('An IPAM pool with that name already exists');
      throw error;
    }
  }

  async listAddresses(tenantId: string, query: ListIpAddressesQueryDto) {
    const limit = Math.min(Math.max(Math.trunc(query.limit ?? 100), 1), 1000);
    const result = await this.db.query(
      `SELECT a.id,a.pool_id AS "poolId",p.name AS "poolName",a.address::text AS address,a.status,a.assignment_type AS "assignmentType",
              a.customer_id AS "customerId",a.router_id AS "routerId",a.session_id AS "sessionId",a.mac_address::text AS "macAddress",
              a.lease_expires_at AS "leaseExpiresAt",a.reservation_ref AS "reservationRef",a.metadata,
              a.allocated_at AS "allocatedAt",a.released_at AS "releasedAt",a.created_at AS "createdAt"
       FROM ipam_addresses a JOIN ipam_pools p ON p.tenant_id=a.tenant_id AND p.id=a.pool_id
       WHERE a.tenant_id=$1 AND ($2::uuid IS NULL OR a.pool_id=$2) AND ($3::text IS NULL OR a.status=$3)
       ORDER BY a.address LIMIT $4`,
      [tenantId, query.poolId ?? null, query.status ?? null, limit],
    );
    return { data: result.rows, count: result.rowCount ?? 0 };
  }

  async addAddress(tenantId: string, poolId: string, dto: AddIpAddressDto) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const pool = await client.query(
        `SELECT id,network,gateway FROM ipam_pools WHERE tenant_id=$1 AND id=$2 AND enabled=true FOR UPDATE`,
        [tenantId, poolId],
      );
      if (!pool.rowCount) throw new NotFoundException('Enabled IPAM pool not found');

      const validation = await client.query(
        `SELECT ($1::inet <<= network) AS contained, ($1::inet = gateway) AS gateway_match
         FROM ipam_pools WHERE tenant_id=$2 AND id=$3`,
        [dto.address, tenantId, poolId],
      );
      if (!validation.rows[0].contained) throw new BadRequestException('Address is outside the pool network');
      if (validation.rows[0].gateway_match) throw new ConflictException('Gateway address cannot be added to the allocatable inventory');

      const result = await client.query(
        `INSERT INTO ipam_addresses
           (tenant_id,pool_id,address,status,assignment_type,reservation_ref,metadata)
         VALUES ($1,$2,$3::inet,$4,$5,$6,$7::jsonb)
         RETURNING id,address::text AS address,status,assignment_type AS "assignmentType",reservation_ref AS "reservationRef"`,
        [tenantId,poolId,dto.address,dto.status ?? 'AVAILABLE',dto.assignmentType ?? (dto.status === 'RESERVED' ? 'RESERVED' : 'DYNAMIC'),
         dto.reservationRef?.trim() || null,dto.metadata ? JSON.parse(dto.metadata) : {}],
      );
      await client.query('COMMIT');
      await this.audit.record(tenantId, 'IPAM_ADDRESS_ADDED', 'ipam_address', result.rows[0].id, { poolId, address: result.rows[0].address, status: result.rows[0].status });
      return result.rows[0];
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch(() => undefined);
      if ((error as { code?: string }).code === '22P02') throw new BadRequestException('Invalid IP address or metadata JSON');
      if ((error as { code?: string }).code === '23505') throw new ConflictException('IP address already exists in this tenant');
      throw error;
    } finally {
      client.release();
    }
  }

  async allocate(tenantId: string, poolId: string, dto: AllocateIpAddressDto) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const pool = await client.query(
        `SELECT id,name,network,gateway,allocation_mode AS "allocationMode"
         FROM ipam_pools WHERE tenant_id=$1 AND id=$2 AND enabled=true FOR UPDATE`,
        [tenantId,poolId],
      );
      if (!pool.rowCount) throw new NotFoundException('Enabled IPAM pool not found');

      let row;
      if (dto.address) {
        const address = await client.query(
          `SELECT id,address::text AS address,status FROM ipam_addresses
           WHERE tenant_id=$1 AND pool_id=$2 AND address=$3::inet
           FOR UPDATE`,
          [tenantId,poolId,dto.address],
        );
        if (!address.rowCount) throw new NotFoundException('Requested address is not present in the IPAM inventory');
        if (address.rows[0].status !== 'AVAILABLE') throw new ConflictException(`Requested address is ${address.rows[0].status}`);
        row = address.rows[0];
      } else {
        const address = await client.query(
          `SELECT id,address::text AS address,status FROM ipam_addresses
           WHERE tenant_id=$1 AND pool_id=$2 AND status='AVAILABLE'
           ORDER BY address
           FOR UPDATE SKIP LOCKED LIMIT 1`,
          [tenantId,poolId],
        );
        if (!address.rowCount) {
          throw new ConflictException(pool.rows[0].allocationMode === 'DYNAMIC'
            ? 'IPAM pool has no available inventory; populate addresses before allocating'
            : 'IPAM pool has no available inventory');
        }
        row = address.rows[0];
      }

      const leaseExpiresAt = dto.leaseSeconds ? new Date(Date.now() + dto.leaseSeconds * 1000) : null;
      const result = await client.query(
        `UPDATE ipam_addresses SET status='ALLOCATED',assignment_type='STATIC'::text,customer_id=$3,router_id=$4,session_id=$5,
                mac_address=$6::macaddr,lease_expires_at=$7,allocated_at=now(),released_at=NULL,updated_at=now()
         WHERE tenant_id=$1 AND id=$2 AND status='AVAILABLE'
         RETURNING id,pool_id AS "poolId",address::text AS address,status,assignment_type AS "assignmentType",
                   customer_id AS "customerId",router_id AS "routerId",session_id AS "sessionId",
                   mac_address::text AS "macAddress",lease_expires_at AS "leaseExpiresAt",allocated_at AS "allocatedAt"`,
        [tenantId,row.id,dto.customerId ?? null,dto.routerId ?? null,dto.sessionId ?? null,dto.macAddress ?? null,leaseExpiresAt],
      );
      if (!result.rowCount) throw new ConflictException('Address was allocated concurrently');
      await client.query('COMMIT');
      await this.audit.record(tenantId, 'IPAM_ADDRESS_ALLOCATED', 'ipam_address', result.rows[0].id, {
        poolId, address: result.rows[0].address, customerId: dto.customerId ?? null, routerId: dto.routerId ?? null,
      });
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async release(tenantId: string, id: string, reason?: string) {
    const result = await this.db.query(
      `UPDATE ipam_addresses
       SET status='AVAILABLE',assignment_type='DYNAMIC',customer_id=NULL,router_id=NULL,session_id=NULL,mac_address=NULL,
           lease_expires_at=NULL,released_at=now(),updated_at=now()
       WHERE tenant_id=$1 AND id=$2 AND status='ALLOCATED'
       RETURNING id,pool_id AS "poolId",address::text AS address,status,released_at AS "releasedAt"`,
      [tenantId,id],
    );
    if (!result.rowCount) throw new NotFoundException('Allocated IP address not found');
    await this.audit.record(tenantId, 'IPAM_ADDRESS_RELEASED', 'ipam_address', id, { poolId: result.rows[0].poolId, address: result.rows[0].address, reason: reason?.trim() || null });
    return result.rows[0];
  }
}
