export type NetworkCapability =
  | 'telemetry'
  | 'client_sessions'
  | 'traffic_counters'
  | 'captive_portal'
  | 'voucher'
  | 'radius_aaa'
  | 'bandwidth_enforcement'
  | 'disconnect_client'
  | 'device_inventory'
  | 'health_monitoring'
  | 'qos'
  | 'cloud_controller';

export type IntegrationMode = 'native_api' | 'radius' | 'snmp' | 'generic_http' | 'gateway';

export interface NetworkVendorCapability {
  vendor: string;
  protocols: string[];
  integrationModes: IntegrationMode[];
  deviceFamilies: string[];
  capabilities: NetworkCapability[];
  notes: string;
}

export const WORLDWIDE_NETWORK_CAPABILITIES: readonly NetworkVendorCapability[] = [
  {
    vendor: 'MikroTik',
    protocols: ['MIKROTIK_REST', 'RADIUS_NAS'],
    integrationModes: ['native_api', 'radius'],
    deviceFamilies: ['RouterOS routers', 'CHR', 'Cloud Hosted Router', 'HotSpot gateways'],
    capabilities: ['telemetry', 'client_sessions', 'traffic_counters', 'captive_portal', 'voucher', 'radius_aaa', 'bandwidth_enforcement', 'disconnect_client', 'device_inventory', 'health_monitoring', 'qos'],
    notes: 'Native RouterOS REST plus RADIUS path. RouterOS User Manager can provide centralized AAA.',
  },
  {
    vendor: 'Ubiquiti UniFi',
    protocols: ['UNIFI_NETWORK_API', 'RADIUS_NAS'],
    integrationModes: ['native_api', 'radius'],
    deviceFamilies: ['UniFi Access Points', 'Cloud Gateways', 'Switches', 'UniFi Network Application'],
    capabilities: ['telemetry', 'client_sessions', 'traffic_counters', 'captive_portal', 'voucher', 'radius_aaa', 'bandwidth_enforcement', 'disconnect_client', 'device_inventory', 'health_monitoring', 'qos', 'cloud_controller'],
    notes: 'Official Network API exposes connected clients and guest authorization, including time, data and rate limits.',
  },
  {
    vendor: 'TP-Link Omada',
    protocols: ['OMADA_CONTROLLER_API', 'RADIUS_NAS'],
    integrationModes: ['native_api', 'radius'],
    deviceFamilies: ['Omada Access Points', 'Omada Gateways', 'Omada Switches', 'OC/Software/Cloud Controller'],
    capabilities: ['telemetry', 'client_sessions', 'traffic_counters', 'captive_portal', 'voucher', 'radius_aaa', 'bandwidth_enforcement', 'disconnect_client', 'device_inventory', 'health_monitoring', 'qos', 'cloud_controller'],
    notes: 'Omada Controller Open API supports REST services and OAuth client credentials.',
  },
  {
    vendor: 'Cambium Networks',
    protocols: ['CAMBIUM_CNMAESTRO', 'RADIUS_NAS'],
    integrationModes: ['native_api', 'radius'],
    deviceFamilies: ['cnPilot Wi-Fi', 'cnWave', 'ePMP', 'cnMatrix', 'cnMaestro-managed devices'],
    capabilities: ['telemetry', 'client_sessions', 'traffic_counters', 'captive_portal', 'radius_aaa', 'bandwidth_enforcement', 'disconnect_client', 'device_inventory', 'health_monitoring', 'qos', 'cloud_controller'],
    notes: 'cnMaestro REST API uses OAuth 2.0 client credentials and exposes sessions, Wi-Fi, statistics and device APIs.',
  },
  {
    vendor: 'Cisco Meraki',
    protocols: ['MERAKI_DASHBOARD_API', 'RADIUS_NAS'],
    integrationModes: ['native_api', 'radius'],
    deviceFamilies: ['Meraki MR', 'Meraki MS', 'Meraki MX', 'Meraki wireless networks'],
    capabilities: ['telemetry', 'client_sessions', 'traffic_counters', 'captive_portal', 'radius_aaa', 'bandwidth_enforcement', 'disconnect_client', 'device_inventory', 'health_monitoring', 'qos', 'cloud_controller'],
    notes: 'Dashboard API supports network/device/client monitoring and live/configuration operations at scale.',
  },
  {
    vendor: 'Aruba Networks',
    protocols: ['ARUBA_CENTRAL_API', 'RADIUS_NAS'],
    integrationModes: ['native_api', 'radius'],
    deviceFamilies: ['Aruba AP', 'Aruba Instant', 'Aruba Central-managed WLAN'],
    capabilities: ['telemetry', 'client_sessions', 'traffic_counters', 'captive_portal', 'radius_aaa', 'device_inventory', 'health_monitoring', 'qos', 'cloud_controller'],
    notes: 'Aruba Central API exposes connected wireless client monitoring and controller-managed WLAN resources.',
  },
  {
    vendor: 'Grandstream',
    protocols: ['GRANDSTREAM_GWN_API', 'RADIUS_NAS'],
    integrationModes: ['native_api', 'radius'],
    deviceFamilies: ['GWN Access Points', 'GWN Cloud', 'GWN Manager'],
    capabilities: ['telemetry', 'client_sessions', 'traffic_counters', 'captive_portal', 'voucher', 'radius_aaa', 'device_inventory', 'health_monitoring', 'qos', 'cloud_controller'],
    notes: 'Designed for controller-managed Wi-Fi deployments; RADIUS provides vendor-neutral AAA fallback.',
  },
  {
    vendor: 'Ruijie / Reyee',
    protocols: ['RUIJIE_REYEE_CLOUD_API', 'RADIUS_NAS'],
    integrationModes: ['native_api', 'radius'],
    deviceFamilies: ['Reyee AP', 'Ruijie AP', 'Ruijie gateways', 'Ruijie Cloud'],
    capabilities: ['telemetry', 'client_sessions', 'traffic_counters', 'captive_portal', 'voucher', 'radius_aaa', 'device_inventory', 'health_monitoring', 'qos', 'cloud_controller'],
    notes: 'Cloud-managed Wi-Fi family with portal/mobile-money deployments common in East African hotspot operations.',
  },
  {
    vendor: 'Ruckus Networks',
    protocols: ['RUCKUS_SMARTZONE_API', 'RADIUS_NAS'],
    integrationModes: ['native_api', 'radius'],
    deviceFamilies: ['Ruckus AP', 'SmartZone', 'Virtual SmartZone', 'Cloud-managed WLAN'],
    capabilities: ['telemetry', 'client_sessions', 'traffic_counters', 'captive_portal', 'radius_aaa', 'device_inventory', 'health_monitoring', 'qos', 'cloud_controller'],
    notes: 'Enterprise WLAN family; use controller APIs or standard RADIUS for subscriber authentication.',
  },
  {
    vendor: 'OpenWrt',
    protocols: ['OPENWRT_UBUS', 'RADIUS_NAS'],
    integrationModes: ['native_api', 'radius'],
    deviceFamilies: ['OpenWrt routers', 'OpenWrt gateways', 'OpenWrt hotspot gateways'],
    capabilities: ['telemetry', 'client_sessions', 'traffic_counters', 'captive_portal', 'radius_aaa', 'bandwidth_enforcement', 'disconnect_client', 'device_inventory', 'health_monitoring', 'qos'],
    notes: 'ubus JSON-RPC provides local management; RADIUS can provide centralized AAA where deployed.',
  },
  {
    vendor: 'Teltonika Networks',
    protocols: ['TELTONIKA_RMS_API', 'RADIUS_NAS'],
    integrationModes: ['native_api', 'radius'],
    deviceFamilies: ['RUT series', 'RUTX series', 'RMS-managed gateways'],
    capabilities: ['telemetry', 'client_sessions', 'traffic_counters', 'captive_portal', 'radius_aaa', 'device_inventory', 'health_monitoring', 'qos', 'cloud_controller'],
    notes: 'Strong fit for cellular/Wi-Fi edge deployments; gateway/controller integration is preferred over device scraping.',
  },
  {
    vendor: 'Peplink / Peplink InControl',
    protocols: ['PEPLINK_INCONTROL_API', 'RADIUS_NAS'],
    integrationModes: ['native_api', 'radius'],
    deviceFamilies: ['MAX routers', 'Balance', 'B-series', 'InControl-managed devices'],
    capabilities: ['telemetry', 'client_sessions', 'traffic_counters', 'device_inventory', 'health_monitoring', 'qos', 'cloud_controller'],
    notes: 'Cloud-managed multi-WAN and cellular edge; subscriber AAA is normally delegated to RADIUS.',
  },
  {
    vendor: 'pfSense / OPNsense',
    protocols: ['PFSENSE_API', 'RADIUS_NAS'],
    integrationModes: ['native_api', 'radius', 'gateway'],
    deviceFamilies: ['pfSense firewalls', 'OPNsense firewalls', 'FreeBSD gateway appliances'],
    capabilities: ['telemetry', 'client_sessions', 'traffic_counters', 'captive_portal', 'radius_aaa', 'bandwidth_enforcement', 'device_inventory', 'health_monitoring', 'qos'],
    notes: 'Best integrated through supported gateway APIs plus FreeRADIUS/standard captive portal mechanisms.',
  },
  {
    vendor: 'FreeRADIUS',
    protocols: ['RADIUS_NAS'],
    integrationModes: ['radius'],
    deviceFamilies: ['Any RADIUS-capable NAS/AP/router/controller'],
    capabilities: ['client_sessions', 'radius_aaa', 'captive_portal'],
    notes: 'Vendor-neutral AAA/accounting backbone. The device performs enforcement while Jaslyn owns policy, billing and accounting state.',
  },
] as const;

export function getNetworkVendorCapability(vendor: string): NetworkVendorCapability | undefined {
  const normalized = vendor.trim().toLowerCase();
  return WORLDWIDE_NETWORK_CAPABILITIES.find((item) => item.vendor.toLowerCase() === normalized);
}
