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
  supportedModelPatterns?: string[];
  capabilities: NetworkCapability[];
  notes: string;
}

export const WORLDWIDE_NETWORK_CAPABILITIES: readonly NetworkVendorCapability[] = [
  {
    vendor: 'MikroTik',
    protocols: ['MIKROTIK_REST', 'RADIUS_NAS'],
    integrationModes: ['native_api', 'radius'],
    deviceFamilies: ['RouterOS routers', 'CHR', 'Cloud Hosted Router', 'HotSpot gateways'],
    supportedModelPatterns: ['all RouterOS models', 'hAP', 'RB', 'CCR', 'CRS', 'cAP', 'wAP', 'LHG', 'SXT', 'Audience', 'Knot', 'CHR'],
    capabilities: ['telemetry', 'client_sessions', 'traffic_counters', 'captive_portal', 'voucher', 'radius_aaa', 'bandwidth_enforcement', 'disconnect_client', 'device_inventory', 'health_monitoring', 'qos'],
    notes: 'Native RouterOS REST plus RADIUS path. RouterOS User Manager can provide centralized AAA.',
  },
  {
    vendor: 'Ubiquiti UniFi',
    protocols: ['UNIFI_NETWORK_API', 'RADIUS_NAS'],
    integrationModes: ['native_api', 'radius'],
    deviceFamilies: ['UniFi Access Points', 'Cloud Gateways', 'Switches', 'UniFi Network Application'],
    supportedModelPatterns: ['all UniFi Network devices', 'UAP', 'U6', 'U7', 'UCG', 'UDM', 'UXG', 'USG', 'USW', 'UNVR', 'UCK', 'UX'],
    capabilities: ['telemetry', 'client_sessions', 'traffic_counters', 'captive_portal', 'voucher', 'radius_aaa', 'bandwidth_enforcement', 'disconnect_client', 'device_inventory', 'health_monitoring', 'qos', 'cloud_controller'],
    notes: 'Official Network API exposes connected clients and guest authorization, including time, data and rate limits.',
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
    vendor: 'TP-Link Omada',
    protocols: ['OMADA_CONTROLLER_API', 'OMADA_LOCAL_CONTROLLER_API', 'SNMP', 'RADIUS_NAS'],
    integrationModes: ['native_api', 'snmp', 'radius'],
    deviceFamilies: ['Omada SDN controllers', 'Gateways', 'JetStream switches', 'Omada access points'],
    supportedModelPatterns: ['all Omada models', 'ER', 'ER7206', 'ER605', 'ER8411', 'SG', 'SX', 'EAP', 'EAP6', 'EAP7', 'OC', 'OC200', 'OC300'],
    capabilities: ['telemetry', 'client_sessions', 'traffic_counters', 'radius_aaa', 'device_inventory', 'health_monitoring', 'qos'],
    notes: 'Omada Cloud and Software/Hardware Controller integrations cover controller-managed gateways, switches and access points.',
  },
  {
    vendor: 'Juniper Networks',
    protocols: ['JUNIPER_JUNOS_NETCONF', 'JUNIPER_MIST_API', 'SNMP', 'RADIUS_NAS'],
    integrationModes: ['native_api', 'snmp', 'radius'],
    deviceFamilies: ['Junos routers', 'EX switches', 'QFX switches', 'SRX firewalls', 'MX routers', 'Mist-managed WLAN'],
    supportedModelPatterns: ['all Junos models', 'MX', 'SRX', 'EX', 'QFX', 'PTX', 'ACX', 'vSRX', 'Mist', 'AP', 'Marvis'],
    capabilities: ['telemetry', 'client_sessions', 'traffic_counters', 'radius_aaa', 'device_inventory', 'health_monitoring', 'qos'],
    notes: 'Juniper support covers Junos NETCONF for routing and switching plus Mist API for cloud-managed WLAN and Marvis operations.',
  },
  {
    vendor: 'Fortinet', protocols: ['FORTINET_FORTIGATE_API', 'SNMP', 'RADIUS_NAS'], integrationModes: ['native_api', 'snmp', 'radius'], deviceFamilies: ['FortiGate firewalls', 'FortiSwitch', 'FortiAP'], supportedModelPatterns: ['all FortiOS models', 'FG', 'FGR', 'FortiGate', 'FortiSwitch', 'FortiAP'], capabilities: ['telemetry', 'traffic_counters', 'radius_aaa', 'device_inventory', 'health_monitoring', 'qos'], notes: 'FortiGate and Fortinet secure networking devices require live validation against the target FortiOS/API version.'
  },
  {
    vendor: 'Dell Networking', protocols: ['DELL_OS10_NETCONF', 'SNMP', 'RADIUS_NAS'], integrationModes: ['native_api', 'snmp', 'radius'], deviceFamilies: ['PowerSwitch OS10', 'PowerSwitch OS9', 'N-series switches'], supportedModelPatterns: ['all Dell PowerSwitch models', 'S41', 'S52', 'S60', 'N15', 'Z9', 'OS10', 'OS9'], capabilities: ['telemetry', 'traffic_counters', 'radius_aaa', 'device_inventory', 'health_monitoring', 'qos'], notes: 'Dell PowerSwitch support targets OS10/OS9 NETCONF and standard telemetry.'
  },
  {
    vendor: 'Netgear', protocols: ['NETGEAR_INSIGHT_API', 'SNMP', 'RADIUS_NAS'], integrationModes: ['native_api', 'snmp', 'radius'], deviceFamilies: ['Insight switches', 'Insight access points', 'Insight gateways'], supportedModelPatterns: ['all Netgear Insight models', 'GC', 'GS', 'MS', 'WAX', 'WAC', 'BR'], capabilities: ['telemetry', 'client_sessions', 'traffic_counters', 'radius_aaa', 'device_inventory', 'health_monitoring'], notes: 'Netgear Insight cloud-managed device support requires controller/account validation.'
  },
  {
    vendor: 'Zyxel', protocols: ['ZYXEL_NEBULA_API', 'SNMP', 'RADIUS_NAS'], integrationModes: ['native_api', 'snmp', 'radius'], deviceFamilies: ['Nebula gateways', 'Nebula switches', 'Nebula access points'], supportedModelPatterns: ['all Nebula models', 'USG FLEX', 'ATP', 'GS', 'XS', 'NWA', 'WAX', 'SCR'], capabilities: ['telemetry', 'client_sessions', 'traffic_counters', 'radius_aaa', 'device_inventory', 'health_monitoring', 'qos'], notes: 'Zyxel Nebula cloud-managed families require live controller validation.'
  },
  {
    vendor: 'Palo Alto Networks', protocols: ['PALOALTO_PANOS_API', 'SNMP', 'RADIUS_NAS'], integrationModes: ['native_api', 'snmp', 'radius'], deviceFamilies: ['PA-Series firewalls', 'VM-Series firewalls', 'Panorama', 'Prisma Access'], supportedModelPatterns: ['all PAN-OS models', 'PA-220', 'PA-400', 'PA-800', 'PA-1400', 'PA-3400', 'PA-5400', 'VM-Series', 'Panorama'], capabilities: ['telemetry', 'traffic_counters', 'radius_aaa', 'device_inventory', 'health_monitoring', 'qos'], notes: 'PAN-OS and Panorama management require live API and tenant validation.'
  },
  {
    vendor: 'SonicWall', protocols: ['SONICWALL_SONICOS_API', 'SNMP', 'RADIUS_NAS'], integrationModes: ['native_api', 'snmp', 'radius'], deviceFamilies: ['TZ firewalls', 'NSa firewalls', 'NSsp firewalls', 'SonicWall cloud management'], supportedModelPatterns: ['all SonicOS models', 'TZ270', 'TZ370', 'TZ470', 'TZ570', 'NSa2700', 'NSa4700', 'NSsp15700'], capabilities: ['telemetry', 'traffic_counters', 'radius_aaa', 'device_inventory', 'health_monitoring', 'qos'], notes: 'SonicOS API and cloud management support require live firmware validation.'
  },
  {
    vendor: 'Barracuda Networks', protocols: ['BARRACUDA_CLOUDGEN_API', 'SNMP', 'RADIUS_NAS'], integrationModes: ['native_api', 'snmp', 'radius'], deviceFamilies: ['CloudGen Firewall', 'CloudGen WAN', 'Barracuda Cloud Control'], supportedModelPatterns: ['all CloudGen models', 'F18', 'F80', 'F93', 'F180', 'F280', 'F380', 'CloudGen Firewall'], capabilities: ['telemetry', 'traffic_counters', 'radius_aaa', 'device_inventory', 'health_monitoring', 'qos'], notes: 'CloudGen and Cloud Control telemetry require live account and firmware validation.'
  },
  {
    vendor: 'Huawei CloudCampus', protocols: ['HUAWEI_CLOUDCAMPUS_API', 'HUAWEI_NETCONF_RESTCONF', 'SNMP', 'RADIUS_NAS'], integrationModes: ['native_api', 'snmp', 'radius'], deviceFamilies: ['CloudCampus controllers', 'CloudEngine campus switches', 'AirEngine APs', 'AR gateways'], supportedModelPatterns: ['all CloudCampus models', 'iMaster', 'S12700', 'S6730', 'S5735', 'CE6850', 'AirEngine', 'AR'], capabilities: ['telemetry', 'client_sessions', 'traffic_counters', 'radius_aaa', 'device_inventory', 'health_monitoring', 'qos'], notes: 'CloudCampus controller and campus-device coverage requires live controller validation.'
  },
  {
    vendor: 'Extreme Networks', protocols: ['EXTREME_CLOUD_IQ_API', 'SNMP', 'RADIUS_NAS'], integrationModes: ['native_api', 'snmp', 'radius'], deviceFamilies: ['ExtremeCloud IQ', 'ExtremeXOS switches', 'Universal access points'], supportedModelPatterns: ['all ExtremeCloud IQ models', 'X440', 'X465', 'X590', 'X695', 'X870', 'VSP', 'AP305C', 'AP410C', 'AP505i'], capabilities: ['telemetry', 'client_sessions', 'traffic_counters', 'radius_aaa', 'device_inventory', 'health_monitoring', 'qos'], notes: 'ExtremeCloud IQ and ExtremeXOS devices require tenant/controller validation.'
  },
  {
    vendor: 'Ruckus Networks', protocols: ['RUCKUS_SMARTZONE_API', 'SNMP', 'RADIUS_NAS'], integrationModes: ['native_api', 'snmp', 'radius'], deviceFamilies: ['Ruckus AP', 'SmartZone', 'Virtual SmartZone', 'Cloud-managed WLAN'], supportedModelPatterns: ['all Ruckus WLAN models', 'R550', 'R650', 'R750', 'R770', 'T350', 'ICX7150', 'ICX7450', 'SmartZone'], capabilities: ['telemetry', 'client_sessions', 'traffic_counters', 'radius_aaa', 'device_inventory', 'health_monitoring', 'qos'], notes: 'Ruckus controller APIs require live SmartZone or cloud validation.'
  },
  {
    vendor: 'WatchGuard', protocols: ['WATCHGUARD_FIREBOX_API', 'SNMP', 'RADIUS_NAS'], integrationModes: ['native_api', 'snmp', 'radius'], deviceFamilies: ['Firebox appliances', 'WatchGuard Cloud', 'Secure Wi-Fi'], supportedModelPatterns: ['all Firebox models', 'T20', 'T40', 'T80', 'M290', 'M390', 'M590', 'M690', 'Firebox Cloud'], capabilities: ['telemetry', 'traffic_counters', 'radius_aaa', 'device_inventory', 'health_monitoring', 'qos'], notes: 'Firebox management and WatchGuard Cloud telemetry require live account validation.'
  },
  {
    vendor: 'Huawei',
    protocols: ['HUAWEI_NETCONF_RESTCONF', 'HUAWEI iMaster NCE API', 'SNMP', 'RADIUS_NAS'],
    integrationModes: ['native_api', 'snmp', 'radius'],
    deviceFamilies: ['Huawei VRP routers', 'NE routers', 'AR routers', 'CloudEngine switches', 'S series switches', 'AC wireless controllers', 'AirEngine WLAN'],
    supportedModelPatterns: ['all VRP models', 'AR', 'NE', 'NetEngine', 'CloudEngine', 'CE', 'S57', 'S67', 'S17', 'AC', 'AirEngine', 'USG'],
    capabilities: ['telemetry', 'client_sessions', 'traffic_counters', 'radius_aaa', 'bandwidth_enforcement', 'disconnect_client', 'device_inventory', 'health_monitoring', 'qos'],
    notes: 'Huawei VRP devices use NETCONF/RESTCONF, iMaster NCE where available, SNMP and RADIUS for interoperable enterprise operations.',
  },
  {
    vendor: 'Cisco',
    protocols: ['CISCO_NETCONF_RESTCONF', 'CISCO_IOS_XE_API', 'SNMP', 'RADIUS_NAS'],
    integrationModes: ['native_api', 'snmp', 'radius'],
    deviceFamilies: ['Cisco IOS routers', 'Cisco IOS-XE routers', 'Catalyst switches', 'ISR', 'ASR', 'Cisco Wireless LAN Controller'],
    supportedModelPatterns: ['all IOS/IOS-XE models', 'ISR', 'ASR', 'CSR', 'Catalyst', 'C9300', 'C9200', 'C9500', 'C9400', 'C2960', 'C9800', 'NCS'],
    capabilities: ['telemetry', 'client_sessions', 'traffic_counters', 'radius_aaa', 'bandwidth_enforcement', 'disconnect_client', 'device_inventory', 'health_monitoring', 'qos'],
    notes: 'Cisco IOS and IOS-XE support uses NETCONF/RESTCONF or the IOS-XE API, with SNMP and RADIUS as interoperable fallbacks.',
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
  return WORLDWIDE_NETWORK_CAPABILITIES.find((item) => item.vendor.toLowerCase() === normalized)
    ?? (normalized === 'cisco ios' || normalized === 'cisco ios-xe' ? WORLDWIDE_NETWORK_CAPABILITIES.find((item) => item.vendor === 'Cisco') : undefined);
}

export function isNetworkModelSupported(vendor: string, model?: string): boolean {
  if (!model?.trim()) return true;
  const capability = getNetworkVendorCapability(vendor);
  if (!capability?.supportedModelPatterns?.length) return true;
  const normalizedModel = model.trim().toLowerCase();
  return capability.supportedModelPatterns.some((pattern) =>
    pattern.toLowerCase().startsWith('all ') || normalizedModel.includes(pattern.toLowerCase()),
  );
}
