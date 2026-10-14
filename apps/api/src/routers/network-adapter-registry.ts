import { Injectable } from '@nestjs/common';

export type AdapterLifecycle = 'NATIVE' | 'GENERIC' | 'RADIUS' | 'SNMP' | 'CATALOG_ONLY';

export type AdapterSupportScope = 'ENFORCEMENT_AND_TELEMETRY' | 'TELEMETRY_ONLY' | 'GENERIC_TELEMETRY';

export interface NetworkAdapterRegistration {
  protocol: string;
  lifecycle: AdapterLifecycle;
  /** Functional scope exposed by the current implementation; not a vendor marketing claim. */
  supportScope: AdapterSupportScope;
  /** Must remain true until a supported firmware/controller matrix is tested on real hardware. */
  liveDeviceValidationRequired: boolean;
  capabilities: readonly string[];
}

/** Prevents the vendor catalogue from being mistaken for executable support. */
@Injectable()
export class NetworkAdapterRegistry {
  private readonly registrations: readonly NetworkAdapterRegistration[] = [
    { protocol: 'MIKROTIK_REST', lifecycle: 'NATIVE', supportScope: 'ENFORCEMENT_AND_TELEMETRY', liveDeviceValidationRequired: true, capabilities: ['health_monitoring', 'bandwidth_enforcement', 'disconnect_client', 'client_sessions'] },
    {
      protocol: 'MERAKI_DASHBOARD_API',
      lifecycle: 'NATIVE',
      supportScope: 'ENFORCEMENT_AND_TELEMETRY',
      liveDeviceValidationRequired: true,
      capabilities: ['bandwidth_enforcement', 'client_sessions', 'device_inventory', 'firmware_inspection', 'firmware_schedule', 'firmware_verification'],
    },
    { protocol: 'OMADA_CONTROLLER_API', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['client_sessions'] },
    { protocol: 'RUIJIE_REYEE_CLOUD_API', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['client_sessions'] },
    { protocol: 'ARUBA_CENTRAL_API', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['client_sessions'] },
    { protocol: 'CAMBIUM_CNMAESTRO', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['client_sessions'] },
    { protocol: 'GRANDSTREAM_GWN_API', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['client_sessions'] },
    { protocol: 'RUCKUS_SMARTZONE_API', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['client_sessions'] },
    { protocol: 'TELTONIKA_RMS_API', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['client_sessions'] },
    { protocol: 'PEPLINK_INCONTROL_API', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['client_sessions'] },
    { protocol: 'PFSENSE_API', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['client_sessions'] },
    {
      protocol: 'UNIFI_NETWORK_API',
      lifecycle: 'NATIVE',
      supportScope: 'TELEMETRY_ONLY',
      liveDeviceValidationRequired: true,
      capabilities: ['client_sessions'],
    },
    {
      protocol: 'OPENWRT_UBUS',
      lifecycle: 'NATIVE',
      supportScope: 'TELEMETRY_ONLY',
      liveDeviceValidationRequired: true,
      capabilities: ['client_sessions'],
    },
    {
      protocol: 'GENERIC_HTTP',
      lifecycle: 'GENERIC',
      supportScope: 'GENERIC_TELEMETRY',
      liveDeviceValidationRequired: true,
      capabilities: ['client_sessions'],
    },
  ];

  list() { return this.registrations; }
  get(protocol: string) { return this.registrations.find((item) => item.protocol === protocol.trim().toUpperCase()); }
  isImplemented(protocol: string) { return this.get(protocol)?.lifecycle !== undefined && this.get(protocol)?.lifecycle !== 'CATALOG_ONLY'; }
  supports(protocol: string, capability: string) { return this.get(protocol)?.capabilities.includes(capability) ?? false; }
}
