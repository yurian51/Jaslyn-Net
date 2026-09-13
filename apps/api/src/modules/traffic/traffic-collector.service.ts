import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { SecureNetworkCredentials } from '../../common/secure-network-credentials';
import { NetworkDeviceAdapterRegistry, NormalizedWifiClient } from './network-device.adapter';
import { TrafficSamplesService } from './traffic-samples.service';
import { NetworkManagementProtocol } from '../../routers/routers.dto';

interface RouterRecord {
  id: string;
  tenantId: string;
  apiEndpoint?: string;
  controllerEndpoint?: string;
  managementProtocol: NetworkManagementProtocol;
  capabilities: Record<string, unknown>;
  managementCredentialsEncrypted?: string;
}
interface SessionRecord { id: string; customerId: string; username?: string; ipAddress?: string; macAddress?: string; }

@Injectable()
export class TrafficCollectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrafficCollectorService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly config: ConfigService,
    private readonly credentials: SecureNetworkCredentials,
    private readonly devices: NetworkDeviceAdapterRegistry,
    private readonly samples: TrafficSamplesService,
  ) {}

  onModuleInit() {
    const configured = Number(this.config.get<string>('JASLYN_TRAFFIC_COLLECTION_INTERVAL_SECONDS', '30'));
    const seconds = Math.min(Math.max(Number.isFinite(configured) ? Math.trunc(configured) : 30, 10), 300);
    this.timer = setInterval(() => void this.collectAll(), seconds * 1000); this.timer.unref?.();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async collectAll(): Promise<{ routers: number; samples: number; errors: number }> {
    if (this.running) return { routers: 0, samples: 0, errors: 0 };
    this.running = true; let samples = 0; let errors = 0;
    const lock = await this.db.query<{ locked: boolean }>('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', ['jaslyn:traffic-collector']);
    if (!lock.rows[0]?.locked) { this.running = false; return { routers: 0, samples: 0, errors: 0 }; }
    try {
      const routers = await this.db.query<RouterRecord>(
        `SELECT id, tenant_id AS "tenantId", api_endpoint AS "apiEndpoint", controller_endpoint AS "controllerEndpoint",
                management_protocol AS "managementProtocol", capabilities, management_credentials_encrypted AS "managementCredentialsEncrypted"
         FROM routers WHERE management_enabled=true AND enabled=true AND (api_enabled=true OR controller_endpoint IS NOT NULL) ORDER BY id`,
      );
      for (const router of routers.rows) {
        try { samples += await this.collectRouter(router); }
        catch (error) {
          errors += 1;
          const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown traffic collection error';
          this.logger.warn(`Traffic collection failed for router ${router.id}: ${message}`);
          await this.db.query(`UPDATE routers SET status='DEGRADED', sync_error=$2, updated_at=now() WHERE tenant_id=$1 AND id=$3`, [router.tenantId, message, router.id]).catch(() => undefined);
        }
      }
      return { routers: routers.rowCount ?? 0, samples, errors };
    } finally {
      await this.db.query('SELECT pg_advisory_unlock(hashtext($1))', ['jaslyn:traffic-collector']).catch(() => undefined);
      this.running = false;
    }
  }

  private async collectRouter(router: RouterRecord): Promise<number> {
    const decrypted = router.managementCredentialsEncrypted ? this.credentials.decrypt(router.managementCredentialsEncrypted) : undefined;
    const active = await this.devices.readClients({
      routerId: router.id, protocol: router.managementProtocol, endpoint: router.apiEndpoint,
      controllerEndpoint: router.controllerEndpoint, capabilities: router.capabilities, credentials: decrypted,
    });
    if (!active.length) { await this.markHealthy(router); return 0; }
    const sessions = await this.db.query<SessionRecord>(
      `SELECT id, customer_id AS "customerId", username, ip_address AS "ipAddress", mac_address AS "macAddress" FROM sessions
       WHERE tenant_id=$1 AND router_id=$2 AND status='ACTIVE' AND customer_id IS NOT NULL`, [router.tenantId, router.id]);
    const byIp = new Map<string, SessionRecord>(); const byUsername = new Map<string, SessionRecord>(); const byMac = new Map<string, SessionRecord>();
    for (const session of sessions.rows) {
      if (session.ipAddress) byIp.set(session.ipAddress, session);
      if (session.username) byUsername.set(session.username, session);
      if (session.macAddress) byMac.set(this.normalizeMac(session.macAddress), session);
    }
    const sampledAt = new Date(); let recorded = 0;
    for (const client of active) {
      const session = this.matchSession(client, byMac, byIp, byUsername);
      if (!session || !this.validCounter(client.bytesIn) || !this.validCounter(client.bytesOut)) continue;
      await this.samples.record(router.tenantId, { routerId: router.id, customerId: session.customerId, sessionId: session.id, bytesIn: client.bytesIn, bytesOut: client.bytesOut, sampledAt });
      recorded += 1;
    }
    await this.markHealthy(router); return recorded;
  }

  private matchSession(client: NormalizedWifiClient, byMac: Map<string, SessionRecord>, byIp: Map<string, SessionRecord>, byUsername: Map<string, SessionRecord>) {
    const mac = client.macAddress?.trim(); if (mac) { const session = byMac.get(this.normalizeMac(mac)); if (session) return session; }
    const address = client.address?.trim(); if (address && byIp.has(address)) return byIp.get(address);
    const username = client.username?.trim(); if (username && byUsername.has(username)) return byUsername.get(username);
    return undefined;
  }
  private normalizeMac(value: string) { return value.trim().toLowerCase().replace(/[^0-9a-f]/g, ''); }
  private validCounter(value: string) { if (!/^\d+$/.test(value)) return false; try { return BigInt(value) <= 9223372036854775807n; } catch { return false; } }
  private async markHealthy(router: RouterRecord) {
    await this.db.query(`UPDATE routers SET status='ONLINE', last_seen_at=now(), sync_error=NULL, updated_at=now() WHERE tenant_id=$1 AND id=$2`, [router.tenantId, router.id]);
  }
}
