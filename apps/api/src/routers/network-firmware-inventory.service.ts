import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditContext, AuditService } from '../audit/audit.service';

export interface FirmwareObservationInput {
  installedVersion: string;
  hardwareRevision?: string;
  latestVersion?: string;
  releaseSourceUrl?: string;
  releasePublishedAt?: string;
  releaseNotes?: string;
}

@Injectable()
export class NetworkFirmwareInventoryService {
  constructor(@Inject(PG_POOL) private readonly db: Pool, private readonly audit: AuditService) {}

  async list(tenantId: string, routerId: string) {
    const router = await this.db.query(
      'SELECT id FROM routers WHERE tenant_id=$1 AND id=$2',
      [tenantId, routerId],
    );
    if (!router.rowCount) throw new NotFoundException('Router not found');
    const result = await this.db.query(
      `SELECT id, router_id AS "routerId", vendor, model, hardware_revision AS "hardwareRevision",
              installed_version AS "installedVersion", observed_at AS "observedAt",
              observation_source AS "observationSource", latest_version AS "latestVersion",
              release_source_url AS "releaseSourceUrl", release_source_verified AS "releaseSourceVerified",
              release_published_at AS "releasePublishedAt", release_notes AS "releaseNotes",
              status, status_reason AS "statusReason", updated_at AS "updatedAt"
       FROM network_firmware_inventory WHERE tenant_id=$1 AND router_id=$2`,
      [tenantId, routerId],
    );
    return { data: result.rows[0] ?? null };
  }

  async observe(tenantId: string, routerId: string, input: FirmwareObservationInput, context: AuditContext = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException('Firmware observation body must be an object');
    }
    const installedVersion = this.requiredText(input.installedVersion, 'installedVersion', 120);
    const hardwareRevision = this.optionalText(input.hardwareRevision, 'hardwareRevision', 120);
    const latestVersion = this.optionalText(input.latestVersion, 'latestVersion', 120);
    const releaseNotes = this.optionalText(input.releaseNotes, 'releaseNotes', 4000);
    const releaseSourceUrl = this.optionalUrl(input.releaseSourceUrl);
    let releasePublishedAt: Date | null = null;
    if (input.releasePublishedAt !== undefined && input.releasePublishedAt !== null && input.releasePublishedAt !== '') {
      if (typeof input.releasePublishedAt !== 'string') throw new BadRequestException('releasePublishedAt must be a valid ISO date');
      releasePublishedAt = new Date(input.releasePublishedAt);
      if (!Number.isFinite(releasePublishedAt.getTime())) throw new BadRequestException('releasePublishedAt must be a valid ISO date');
    }

    const routerResult = await this.db.query(
      `SELECT id, vendor, model FROM routers WHERE tenant_id=$1 AND id=$2`,
      [tenantId, routerId],
    );
    const router = routerResult.rows[0];
    if (!router) throw new NotFoundException('Router not found');

    // Caller-supplied release metadata is stored as a lead only, never trusted as authoritative.
    // Do not infer CURRENT or UPDATE_AVAILABLE until a vendor source has been independently verified.
    const status = 'UNKNOWN';
    const statusReason = latestVersion
      ? 'Release metadata was supplied but has not been independently verified against an authoritative vendor source.'
      : 'Installed firmware was observed; no verified compatible vendor release is available.';

    const result = await this.db.query(
      `INSERT INTO network_firmware_inventory
         (tenant_id, router_id, vendor, model, hardware_revision, installed_version, observed_at,
          observation_source, latest_version, release_source_url, release_source_verified,
          release_published_at, release_notes, status, status_reason, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,now(),'MANUAL',$7,$8,false,$9,$10,$11,$12,$13,now())
       ON CONFLICT (tenant_id, router_id) DO UPDATE SET
         vendor=EXCLUDED.vendor, model=EXCLUDED.model, hardware_revision=EXCLUDED.hardware_revision,
         installed_version=EXCLUDED.installed_version, observed_at=EXCLUDED.observed_at,
         observation_source=EXCLUDED.observation_source, latest_version=EXCLUDED.latest_version,
         release_source_url=EXCLUDED.release_source_url, release_source_verified=false,
         release_published_at=EXCLUDED.release_published_at, release_notes=EXCLUDED.release_notes,
         status=EXCLUDED.status, status_reason=EXCLUDED.status_reason,
         updated_by=EXCLUDED.updated_by, updated_at=now()
       WHERE network_firmware_inventory.tenant_id=EXCLUDED.tenant_id
       RETURNING id, router_id AS "routerId", vendor, model, hardware_revision AS "hardwareRevision",
         installed_version AS "installedVersion", observed_at AS "observedAt",
         observation_source AS "observationSource", latest_version AS "latestVersion",
         release_source_url AS "releaseSourceUrl", release_source_verified AS "releaseSourceVerified",
         release_published_at AS "releasePublishedAt", release_notes AS "releaseNotes",
         status, status_reason AS "statusReason", updated_at AS "updatedAt"`,
      [tenantId, routerId, router.vendor ?? 'Unknown', router.model ?? null, hardwareRevision,
        installedVersion, latestVersion, releaseSourceUrl, releasePublishedAt, releaseNotes,
        status, statusReason, context.userId ?? null],
    );
    const inventory = result.rows[0];
    await this.audit.record(tenantId, 'NETWORK_FIRMWARE_OBSERVED', 'router_firmware', inventory.id, {
      routerId, installedVersion, latestVersion: latestVersion ?? null, status,
      releaseSourceVerified: false,
    }, context);
    return inventory;
  }

  private requiredText(value: unknown, field: string, max: number): string {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
      throw new BadRequestException(`${field} must be a non-empty string of at most ${max} characters`);
    }
    return value.trim();
  }

  private optionalText(value: unknown, field: string, max: number): string | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || value.trim().length > max) {
      throw new BadRequestException(`${field} must be a string of at most ${max} characters`);
    }
    return value.trim() || null;
  }

  private optionalUrl(value: unknown): string | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || value.length > 2048) throw new BadRequestException('releaseSourceUrl must be a valid HTTPS URL');
    let parsed: URL;
    try { parsed = new URL(value); } catch { throw new BadRequestException('releaseSourceUrl must be a valid HTTPS URL'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) {
      throw new BadRequestException('releaseSourceUrl must be HTTPS without embedded credentials or a fragment');
    }
    return parsed.toString();
  }
}
