import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { UpdateUpesiLipaSiteDto } from './upesilipa.dto';

const HARDWARE = [
  { vendor: 'MikroTik', mode: 'NATIVE', protocol: 'MIKROTIK_REST' },
  { vendor: 'TP-Link Omada', mode: 'CATALOG_ONLY', protocol: 'OMADA_CONTROLLER_API' },
  { vendor: 'Ubiquiti UniFi', mode: 'NATIVE', protocol: 'UNIFI_NETWORK_API' },
  { vendor: 'Ruijie Reyee', mode: 'CATALOG_ONLY', protocol: 'RUIJIE_REYEE_CLOUD_API' },
  { vendor: 'Cambium', mode: 'CATALOG_ONLY', protocol: 'CAMBIUM_CNMAESTRO' },
  { vendor: 'Cudy', mode: 'CATALOG_ONLY', protocol: 'GENERIC_HTTP' },
  { vendor: 'Ruckus', mode: 'CATALOG_ONLY', protocol: 'RUCKUS_SMARTZONE_API' },
  { vendor: 'OpenWrt', mode: 'NATIVE', protocol: 'OPENWRT_UBUS' },
  { vendor: 'Grandstream', mode: 'CATALOG_ONLY', protocol: 'GRANDSTREAM_GWN_API' },
  { vendor: 'Aruba', mode: 'CATALOG_ONLY', protocol: 'ARUBA_CENTRAL_API' },
  { vendor: 'Cisco WLC', mode: 'RADIUS', protocol: 'RADIUS_NAS' },
  { vendor: 'Cisco Meraki', mode: 'NATIVE', protocol: 'MERAKI_DASHBOARD_API' },
  { vendor: 'pfSense', mode: 'CATALOG_ONLY', protocol: 'PFSENSE_API' },
] as const;

const GATEWAYS = ['PalmPesa', 'PlusPesa', 'FimiPay', 'ClickPesa', 'AzamPay', 'Snippe', 'Selcom', 'SonicPesa'] as const;

@Injectable()
export class UpesiLipaService {
  constructor(
    @Inject(PG_POOL) private readonly db: Pool,
    private readonly audit: AuditService,
  ) {}

  capabilities() {
    return {
      provider: 'upesilipa',
      source: 'https://upesilipa.com/',
      model: 'wifi-billing-platform',
      paymentMethods: ['M-Pesa', 'Mixx by Yas', 'Airtel Money', 'HaloPesa'],
      gateways: GATEWAYS,
      hardware: HARDWARE,
      implementedByJaslyn: [
        'custom_packages',
        'vouchers',
        'mobile_money_provider_catalog',
        'live_sessions',
        'router_health',
        'multi_site_locations',
        'native_mikrotik',
        'native_unifi_client_sessions',
        'native_openwrt_client_sessions',
        'native_meraki',
        'cloud_radius',
        'branded_portal_settings',
        'portal_themes',
        'site_health_summary',
        'grace_period_configuration',
      ],
      catalogOnlyHardware: HARDWARE.filter((item) => item.mode === 'CATALOG_ONLY').map((item) => item.vendor),
    };
  }

  async dashboard(tenantId: string) {
    const [locations, routers, sessions, sales, vouchers] = await Promise.all([
      this.db.query('SELECT count(*)::int AS count FROM locations WHERE tenant_id=$1', [tenantId]),
      this.db.query(
        "SELECT count(*)::int AS total, count(*) FILTER (WHERE status='ONLINE')::int AS online, count(*) FILTER (WHERE status NOT IN ('ONLINE','OFFLINE'))::int AS degraded FROM routers WHERE tenant_id=$1",
        [tenantId],
      ),
      this.db.query("SELECT count(*)::int AS count FROM sessions WHERE tenant_id=$1 AND status='ACTIVE'", [tenantId]),
      this.db.query(
        "SELECT COALESCE(sum(price),0)::numeric AS amount, count(*)::int AS count FROM wifi_plan_purchases WHERE tenant_id=$1 AND status='PAID' AND created_at >= date_trunc('day', now())",
        [tenantId],
      ),
      this.db.query(
        "SELECT count(*)::int AS total, count(*) FILTER (WHERE status='UNUSED')::int AS unused, count(*) FILTER (WHERE status='USED')::int AS used, count(*) FILTER (WHERE status='EXPIRED')::int AS expired FROM vouchers WHERE tenant_id=$1",
        [tenantId],
      ),
    ]);

    return {
      data: {
        locations: locations.rows[0],
        routers: routers.rows[0],
        activeSessions: sessions.rows[0]?.count ?? 0,
        todaySales: sales.rows[0],
        vouchers: vouchers.rows[0],
      },
      source: 'jaslyn-live-database',
    };
  }

  async getSiteSettings(tenantId: string, locationId: string) {
    const location = await this.db.query(
      'SELECT id, name FROM locations WHERE tenant_id=$1 AND id=$2',
      [tenantId, locationId],
    );
    if (!location.rowCount) throw new NotFoundException('Site/location not found');

    const result = await this.db.query(
      'SELECT id, location_id AS "locationId", logo_url AS "logoUrl", primary_color AS "primaryColor", secondary_color AS "secondaryColor", support_phone AS "supportPhone", portal_theme AS "portalTheme", grace_period_seconds AS "gracePeriodSeconds", health_check_enabled AS "healthCheckEnabled", enabled, created_at AS "createdAt", updated_at AS "updatedAt" FROM upesilipa_site_settings WHERE tenant_id=$1 AND location_id=$2',
      [tenantId, locationId],
    );
    return {
      site: location.rows[0],
      settings: result.rows[0] ?? {
        locationId,
        portalTheme: 'MINIMAL',
        gracePeriodSeconds: 0,
        healthCheckEnabled: true,
        enabled: true,
      },
    };
  }

  async updateSiteSettings(tenantId: string, locationId: string, input: UpdateUpesiLipaSiteDto, userId?: string) {
    const location = await this.db.query(
      'SELECT id, name FROM locations WHERE tenant_id=$1 AND id=$2',
      [tenantId, locationId],
    );
    if (!location.rowCount) throw new NotFoundException('Site/location not found');

    const current = await this.getSiteSettings(tenantId, locationId);
    const s = current.settings;
    const result = await this.db.query(
      'INSERT INTO upesilipa_site_settings (tenant_id, location_id, logo_url, primary_color, secondary_color, support_phone, portal_theme, grace_period_seconds, health_check_enabled, enabled) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (tenant_id, location_id) DO UPDATE SET logo_url=EXCLUDED.logo_url, primary_color=EXCLUDED.primary_color, secondary_color=EXCLUDED.secondary_color, support_phone=EXCLUDED.support_phone, portal_theme=EXCLUDED.portal_theme, grace_period_seconds=EXCLUDED.grace_period_seconds, health_check_enabled=EXCLUDED.health_check_enabled, enabled=EXCLUDED.enabled, updated_at=now() RETURNING id, location_id AS "locationId", logo_url AS "logoUrl", primary_color AS "primaryColor", secondary_color AS "secondaryColor", support_phone AS "supportPhone", portal_theme AS "portalTheme", grace_period_seconds AS "gracePeriodSeconds", health_check_enabled AS "healthCheckEnabled", enabled',
      [
        tenantId, locationId,
        input.logoUrl ?? s.logoUrl ?? null,
        input.primaryColor ?? s.primaryColor ?? null,
        input.secondaryColor ?? s.secondaryColor ?? null,
        input.supportPhone ?? s.supportPhone ?? null,
        input.portalTheme ?? s.portalTheme ?? 'MINIMAL',
        input.gracePeriodSeconds ?? s.gracePeriodSeconds ?? 0,
        input.healthCheckEnabled ?? s.healthCheckEnabled ?? true,
        input.enabled ?? s.enabled ?? true,
      ],
    );

    await this.audit.record(tenantId, 'UPESILIPA_SITE_SETTINGS_UPDATED', 'location', locationId, {
      portalTheme: result.rows[0].portalTheme,
      gracePeriodSeconds: result.rows[0].gracePeriodSeconds,
      healthCheckEnabled: result.rows[0].healthCheckEnabled,
    }, { userId });

    return { site: location.rows[0], settings: result.rows[0] };
  }

  async siteHealth(tenantId: string, locationId: string) {
    const location = await this.db.query(
      'SELECT id, name FROM locations WHERE tenant_id=$1 AND id=$2',
      [tenantId, locationId],
    );
    if (!location.rowCount) throw new NotFoundException('Site/location not found');

    const result = await this.db.query(
      'SELECT r.id, r.name, r.status, r.active_users AS "activeUsers", r.last_seen_at AS "lastSeenAt", r.sync_error AS "syncError", r.management_protocol AS "managementProtocol" FROM routers r WHERE r.tenant_id=$1 AND r.location_id=$2 ORDER BY r.name',
      [tenantId, locationId],
    );

    const routers = result.rows;
    const online = routers.filter((r) => r.status === 'ONLINE').length;
    const offline = routers.filter((r) => r.status === 'OFFLINE').length;
    const degraded = routers.filter((r) => r.status !== 'ONLINE' && r.status !== 'OFFLINE').length;

    return {
      site: location.rows[0],
      summary: {
        routers: routers.length,
        online,
        offline,
        degraded,
        health: routers.length === 0 ? 'NO_DEVICES' : offline === routers.length ? 'OFFLINE' : offline > 0 || degraded > 0 ? 'DEGRADED' : 'HEALTHY',
      },
      routers,
      source: 'jaslyn-live-database',
    };
  }
}
