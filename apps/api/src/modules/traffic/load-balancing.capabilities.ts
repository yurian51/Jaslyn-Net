import { NetworkManagementProtocol } from '../../routers/routers.dto';

export type WanRoutingCapability =
  | 'wan_telemetry'
  | 'gateway_health'
  | 'policy_routing'
  | 'weighted_load_balancing'
  | 'failover'
  | 'route_read'
  | 'route_write';

export interface WanRoutingAdapterCapabilities {
  protocol: NetworkManagementProtocol;
  capabilities: readonly WanRoutingCapability[];
}

/**
 * Capability declarations are deliberately conservative. An integration may only
 * apply routing changes when its adapter explicitly implements the operation.
 */
export const WAN_ROUTING_CAPABILITIES: Readonly<Record<NetworkManagementProtocol, readonly WanRoutingCapability[]>> = {
  MIKROTIK_REST: ['wan_telemetry', 'gateway_health', 'policy_routing', 'weighted_load_balancing', 'failover', 'route_read', 'route_write'],
  UNIFI_NETWORK_API: ['wan_telemetry', 'gateway_health', 'failover', 'route_read'],
  OMADA_CONTROLLER_API: ['wan_telemetry', 'gateway_health', 'failover', 'route_read'],
  CAMBIUM_CNMAESTRO: ['wan_telemetry', 'gateway_health', 'route_read'],
  MERAKI_DASHBOARD_API: ['wan_telemetry', 'gateway_health', 'failover', 'route_read'],
  ARUBA_CENTRAL_API: ['wan_telemetry', 'gateway_health', 'route_read'],
  GRANDSTREAM_GWN_API: ['wan_telemetry', 'gateway_health', 'route_read'],
  RUIJIE_REYEE_CLOUD_API: ['wan_telemetry', 'gateway_health', 'failover', 'route_read'],
  RUCKUS_SMARTZONE_API: ['wan_telemetry', 'gateway_health', 'route_read'],
  OPENWRT_UBUS: ['wan_telemetry', 'gateway_health', 'policy_routing', 'weighted_load_balancing', 'failover', 'route_read', 'route_write'],
  TELTONIKA_RMS_API: ['wan_telemetry', 'gateway_health', 'failover', 'route_read'],
  PEPLINK_INCONTROL_API: ['wan_telemetry', 'gateway_health', 'weighted_load_balancing', 'failover', 'route_read'],
  PFSENSE_API: ['wan_telemetry', 'gateway_health', 'policy_routing', 'weighted_load_balancing', 'failover', 'route_read', 'route_write'],
  GENERIC_HTTP: [],
  SNMP: ['wan_telemetry', 'gateway_health', 'route_read'],
  RADIUS_NAS: [],
};

export function hasWanRoutingCapability(protocol: NetworkManagementProtocol, capability: WanRoutingCapability) {
  return WAN_ROUTING_CAPABILITIES[protocol]?.includes(capability) ?? false;
}
