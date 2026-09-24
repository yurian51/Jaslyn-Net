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
    { protocol: 'MIKROTIK_REST', lifecycle: 'IMPLEMENTED', capabilities: ['health_monitoring', 'bandwidth_enforcement', 'disconnect_client'] },
  ];

  list() { return this.registrations; }
  get(protocol: string) { return this.registrations.find((item) => item.protocol === protocol.trim().toUpperCase()); }
  isImplemented(protocol: string) { return this.get(protocol)?.lifecycle === 'IMPLEMENTED'; }
}
