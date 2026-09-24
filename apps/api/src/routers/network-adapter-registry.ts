import { Injectable } from '@nestjs/common';

export type AdapterLifecycle = 'IMPLEMENTED' | 'CATALOG_ONLY';

export interface NetworkAdapterRegistration {
  protocol: string;
  lifecycle: AdapterLifecycle;
  capabilities: readonly string[];
}

/** Prevents the vendor catalogue from being mistaken for executable support. */
@Injectable()
export class NetworkAdapterRegistry {
  private readonly registrations: readonly NetworkAdapterRegistration[] = [
    { protocol: 'MIKROTIK_REST', lifecycle: 'IMPLEMENTED', capabilities: ['health_monitoring', 'bandwidth_enforcement', 'disconnect_client', 'client_sessions'] },
    {
      protocol: 'MERAKI_DASHBOARD_API',
      lifecycle: 'IMPLEMENTED',
      capabilities: ['bandwidth_enforcement', 'client_sessions', 'device_inventory'],
    },
    {
      protocol: 'UNIFI_NETWORK_API',
      lifecycle: 'IMPLEMENTED',
      capabilities: ['client_sessions'],
    },
    {
      protocol: 'OPENWRT_UBUS',
      lifecycle: 'IMPLEMENTED',
      capabilities: ['client_sessions'],
    },
    {
      protocol: 'GENERIC_HTTP',
      lifecycle: 'IMPLEMENTED',
      capabilities: ['client_sessions'],
    },
  ];

  list() { return this.registrations; }
  get(protocol: string) { return this.registrations.find((item) => item.protocol === protocol.trim().toUpperCase()); }
  isImplemented(protocol: string) { return this.get(protocol)?.lifecycle === 'IMPLEMENTED'; }
}
