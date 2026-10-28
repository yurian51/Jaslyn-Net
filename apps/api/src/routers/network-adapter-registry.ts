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
      capabilities: ['bandwidth_enforcement', 'client_sessions', 'device_inventory'],
    },
    { protocol: 'OMADA_CONTROLLER_API', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['device_inventory', 'health_monitoring', 'client_sessions', 'traffic_counters', 'telemetry'] },
    { protocol: 'OMADA_LOCAL_CONTROLLER_API', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['device_inventory', 'health_monitoring', 'client_sessions', 'traffic_counters', 'telemetry'] },
    { protocol: 'RUIJIE_REYEE_CLOUD_API', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['device_inventory', 'health_monitoring', 'client_sessions', 'traffic_counters', 'telemetry', 'captive_portal', 'qos'] },
    { protocol: 'CAMBIUM_CNMAESTRO', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['client_sessions'] },
    { protocol: 'GRANDSTREAM_GWN_API', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['client_sessions'] },
    { protocol: 'RUCKUS_SMARTZONE_API', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['client_sessions'] },
    { protocol: 'TELTONIKA_RMS_API', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['client_sessions'] },
    { protocol: 'PEPLINK_INCONTROL_API', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['client_sessions'] },
    { protocol: 'PFSENSE_API', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['client_sessions'] },
    {
      protocol: 'CISCO_NETCONF_RESTCONF',
      lifecycle: 'NATIVE',
      supportScope: 'TELEMETRY_ONLY',
      liveDeviceValidationRequired: true,
      capabilities: ['device_inventory', 'health_monitoring', 'client_sessions', 'traffic_counters', 'telemetry'],
    },
    {
      protocol: 'CISCO_IOS_XE_API',
      lifecycle: 'NATIVE',
      supportScope: 'TELEMETRY_ONLY',
      liveDeviceValidationRequired: true,
      capabilities: ['device_inventory', 'health_monitoring', 'client_sessions', 'traffic_counters', 'telemetry'],
    },
    {
      protocol: 'HUAWEI_NETCONF_RESTCONF',
      lifecycle: 'NATIVE',
      supportScope: 'TELEMETRY_ONLY',
      liveDeviceValidationRequired: true,
      capabilities: ['device_inventory', 'health_monitoring', 'client_sessions', 'traffic_counters', 'telemetry'],
    },
    {
      protocol: 'HUAWEI_IMASTER_NCE_API',
      lifecycle: 'NATIVE',
      supportScope: 'TELEMETRY_ONLY',
      liveDeviceValidationRequired: true,
      capabilities: ['device_inventory', 'health_monitoring', 'client_sessions', 'traffic_counters', 'telemetry'],
    },
    {
      protocol: 'JUNIPER_JUNOS_NETCONF',
      lifecycle: 'NATIVE',
      supportScope: 'TELEMETRY_ONLY',
      liveDeviceValidationRequired: true,
      capabilities: ['device_inventory', 'health_monitoring', 'traffic_counters', 'telemetry'],
    },
    {
      protocol: 'JUNIPER_MIST_API',
      lifecycle: 'NATIVE',
      supportScope: 'TELEMETRY_ONLY',
      liveDeviceValidationRequired: true,
      capabilities: ['device_inventory', 'health_monitoring', 'client_sessions', 'traffic_counters', 'telemetry'],
    },
    { protocol: 'FORTINET_FORTIGATE_API', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['device_inventory', 'health_monitoring', 'traffic_counters', 'telemetry'] },
    { protocol: 'DELL_OS10_NETCONF', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['device_inventory', 'health_monitoring', 'traffic_counters', 'telemetry'] },
    { protocol: 'NETGEAR_INSIGHT_API', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['device_inventory', 'health_monitoring', 'client_sessions', 'traffic_counters', 'telemetry'] },
    { protocol: 'ZYXEL_NEBULA_API', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['device_inventory', 'health_monitoring', 'client_sessions', 'traffic_counters', 'telemetry'] },
    { protocol: 'HUAWEI_CLOUDCAMPUS_API', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['device_inventory', 'health_monitoring', 'client_sessions', 'traffic_counters', 'telemetry'] },
    { protocol: 'EXTREME_CLOUD_IQ_API', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['device_inventory', 'health_monitoring', 'client_sessions', 'traffic_counters', 'telemetry'] },
    { protocol: 'RUCKUS_SMARTZONE_API', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['device_inventory', 'health_monitoring', 'client_sessions', 'traffic_counters', 'telemetry'] },
    { protocol: 'WATCHGUARD_FIREBOX_API', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['device_inventory', 'health_monitoring', 'traffic_counters', 'telemetry'] },
    { protocol: 'PALOALTO_PANOS_API', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['device_inventory', 'health_monitoring', 'traffic_counters', 'telemetry'] },
    { protocol: 'SONICWALL_SONICOS_API', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['device_inventory', 'health_monitoring', 'traffic_counters', 'telemetry'] },
    { protocol: 'BARRACUDA_CLOUDGEN_API', lifecycle: 'NATIVE', supportScope: 'TELEMETRY_ONLY', liveDeviceValidationRequired: true, capabilities: ['device_inventory', 'health_monitoring', 'traffic_counters', 'telemetry'] },
    {
      protocol: 'ARUBA_CENTRAL_API',
      lifecycle: 'NATIVE',
      supportScope: 'TELEMETRY_ONLY',
      liveDeviceValidationRequired: true,
      capabilities: ['device_inventory', 'health_monitoring', 'client_sessions', 'traffic_counters', 'telemetry'],
    },
    {
      protocol: 'ARUBA_AOS_CX_NETCONF',
      lifecycle: 'NATIVE',
      supportScope: 'TELEMETRY_ONLY',
      liveDeviceValidationRequired: true,
      capabilities: ['device_inventory', 'health_monitoring', 'traffic_counters', 'telemetry'],
    },
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
  readiness(protocol: string) {
    const registration = this.get(protocol);
    if (!registration) return { status: 'unsupported' as const, liveDeviceValidationRequired: true, capabilities: [] as readonly string[] };
    return { status: registration.liveDeviceValidationRequired ? 'validation_required' as const : 'ready' as const, liveDeviceValidationRequired: registration.liveDeviceValidationRequired, capabilities: registration.capabilities };
  }

  validateEndpoint(protocol: string, endpoint: string) {
    const readiness = this.readiness(protocol);
    if (readiness.status === 'unsupported') return { ...readiness, endpointValid: false, reason: 'Protocol is not registered.' };
    try {
      const url = new URL(endpoint);
      const endpointValid = url.protocol === 'https:' && !url.username && !url.password && !url.hash;
      return { ...readiness, endpointValid, reason: endpointValid ? undefined : 'Use an HTTPS endpoint without embedded credentials or fragments.' };
    } catch {
      return { ...readiness, endpointValid: false, reason: 'Endpoint must be a valid HTTPS URL.' };
    }
  }
}
