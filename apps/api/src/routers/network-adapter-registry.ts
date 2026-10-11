import { Injectable } from '@nestjs/common';

export type AdapterLifecycle = 'NATIVE' | 'GENERIC' | 'RADIUS' | 'SNMP' | 'CATALOG_ONLY';

export interface NetworkAdapterRegistration {
  protocol: string;
  lifecycle: AdapterLifecycle;
  capabilities: readonly string[];
}

/** Prevents the vendor catalogue from being mistaken for executable support. */
@Injectable()
export class NetworkAdapterRegistry {
  private readonly registrations: readonly NetworkAdapterRegistration[] = [
    { protocol: 'MIKROTIK_REST', lifecycle: 'NATIVE', capabilities: ['health_monitoring', 'bandwidth_enforcement', 'disconnect_client', 'client_sessions'] },
    {
      protocol: 'MERAKI_DASHBOARD_API',
      lifecycle: 'NATIVE',
      capabilities: ['bandwidth_enforcement', 'client_sessions', 'device_inventory'],
    },
    { protocol: 'OMADA_CONTROLLER_API', lifecycle: 'NATIVE', capabilities: ['client_sessions', 'device_inventory'] },
    { protocol: 'RUIJIE_REYEE_CLOUD_API', lifecycle: 'NATIVE', capabilities: ['client_sessions'] },
    {
      protocol: 'UNIFI_NETWORK_API',
      lifecycle: 'NATIVE',
      capabilities: ['client_sessions'],
    },
    {
      protocol: 'OPENWRT_UBUS',
      lifecycle: 'NATIVE',
      capabilities: ['client_sessions'],
    },
    {
      protocol: 'GENERIC_HTTP',
      lifecycle: 'GENERIC',
      capabilities: ['client_sessions'],
    },
  ];

  list() { return this.registrations; }
  get(protocol: string) { return this.registrations.find((item) => item.protocol === protocol.trim().toUpperCase()); }
  isImplemented(protocol: string) { return this.get(protocol)?.lifecycle !== undefined && this.get(protocol)?.lifecycle !== 'CATALOG_ONLY'; }
  supports(protocol: string, capability: string) { return this.get(protocol)?.capabilities.includes(capability) ?? false; }
}
