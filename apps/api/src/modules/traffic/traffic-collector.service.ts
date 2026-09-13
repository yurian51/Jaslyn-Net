import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { MikroTikHotspotActiveRecord, MikroTikTrafficEnforcementAdapter } from './mikrotik.adapter';
import { TrafficSamplesService } from './traffic-samples.service';

interface RouterRecord {
  id: string;
  tenantId: string;
  apiEndpoint: string;
}

interface SessionRecord {
  id: string;
  customerId: string;
  username?: string;
  ipAddress?: string;
}

@Injectable()
export class TrafficCollectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrafficCollectorService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly config: ConfigService,
    private readonly adapter: MikroTikTrafficEnforcementAdapter,
    private readonly samples: TrafficSamplesService,
  ) {}

  onModuleInit() {
    const configured = Number(this.config.get<string>('JASLYN_TRAFFIC_COLLECTION_INTERVAL_SECONDS', '30'));
    const seconds = Math.min(Math.max(Number.isFinite(configured) ? Math.trunc(configured) : 30, 10), 300);
    this.timer = setInterval(() => void this.collectAll(), seconds * 1000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async collectAll(): Promise<{ routers: number; samples: number; errors: number }> {
    if (this.running) return { routers: 0, samples: 0, errors: 0 };
    this.running = true;
    let samples = 0;
    let errors = 0;
    try {
      const routers = await this.db.query<RouterRecord>(
        `SELECT id, tenant_id AS "tenantId", api_endpoint AS "apiEndpoint"
         FROM routers
         WHERE api_enabled=true AND enabled=true AND api_endpoint IS NOT NULL
         ORDER BY id`,
      );
      for (const router of routers.rows) {
        try {
          samples += await this.collectRouter(router);
        } catch (error) {
          errors += 1;
          const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown traffic collection error';
          this.logger.warn(`Traffic collection failed for router ${router.id}: ${message}`);
          await this.db.query(
            `UPDATE routers SET sync_error=$2, updated_at=now() WHERE tenant_id=$1 AND id=$3`,
            [router.tenantId, message, router.id],
          ).catch(() => undefined);
        }
      }
      return { routers: routers.rowCount ?? 0, samples, errors };
    } finally {
      this.running = false;
    }
  }

  private async collectRouter(router: RouterRecord): Promise<number> {
    const active = await this.adapter.readHotspotActive(router.apiEndpoint);
    if (!active.length) {
      await this.db.query(`UPDATE routers SET last_seen_at=now(), sync_error=NULL, updated_at=now() WHERE tenant_id=$1 AND id=$2`, [router.tenantId, router.id]);
      return 0;
    }

    const sessions = await this.db.query<SessionRecord>(
      `SELECT id, customer_id AS "customerId", username, ip_address AS "ipAddress"
       FROM sessions
       WHERE tenant_id=$1 AND router_id=$2 AND status='ACTIVE' AND customer_id IS NOT NULL`,
      [router.tenantId, router.id],
    );
    const byIp = new Map<string, SessionRecord>();
    const byUsername = new Map<string, SessionRecord>();
    for (const session of sessions.rows) {
      if (session.ipAddress) byIp.set(session.ipAddress, session);
      if (session.username) byUsername.set(session.username, session);
    }

    const sampledAt = new Date();
    let recorded = 0;
    for (const record of active) {
      const session = this.matchSession(record, byIp, byUsername);
      if (!session) continue;
      const bytesIn = this.counter(record['bytes-in']);
      const bytesOut = this.counter(record['bytes-out']);
      if (bytesIn === null || bytesOut === null) continue;
      await this.samples.record(router.tenantId, {
        routerId: router.id,
        customerId: session.customerId,
        sessionId: session.id,
        bytesIn,
        bytesOut,
        sampledAt,
      });
      recorded += 1;
    }
    await this.db.query(`UPDATE routers SET last_seen_at=now(), sync_error=NULL, updated_at=now() WHERE tenant_id=$1 AND id=$2`, [router.tenantId, router.id]);
    return recorded;
  }

  private matchSession(record: MikroTikHotspotActiveRecord, byIp: Map<string, SessionRecord>, byUsername: Map<string, SessionRecord>) {
    const address = record.address?.trim();
    if (address && byIp.has(address)) return byIp.get(address);
    const username = record.user?.trim();
    if (username && byUsername.has(username)) return byUsername.get(username);
    return undefined;
  }

  private counter(value?: string): string | null {
    if (!value || !/^\d+$/.test(value)) return null;
    const parsed = BigInt(value);
    return parsed <= 9223372036854775807n ? value : null;
  }
}
