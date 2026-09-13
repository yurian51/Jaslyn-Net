import { IsBoolean, IsIP, IsIn, IsInt, IsOptional, IsString, IsUUID, IsUrl, Max, MaxLength, Min } from 'class-validator';

export const NETWORK_MANAGEMENT_PROTOCOLS = [
  'MIKROTIK_REST',
  'UNIFI_NETWORK_API',
  'OMADA_CONTROLLER_API',
  'CAMBIUM_CNMAESTRO',
  'MERAKI_DASHBOARD_API',
  'ARUBA_CENTRAL_API',
  'GRANDSTREAM_GWN_API',
  'RUIJIE_REYEE_CLOUD_API',
  'RUCKUS_SMARTZONE_API',
  'OPENWRT_UBUS',
  'TELTONIKA_RMS_API',
  'PEPLINK_INCONTROL_API',
  'PFSENSE_API',
  'GENERIC_HTTP',
  'SNMP',
  'RADIUS_NAS',
] as const;
export type NetworkManagementProtocol = typeof NETWORK_MANAGEMENT_PROTOCOLS[number];

export class CreateRouterDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  vendor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;

  @IsOptional()
  @IsIP()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  macAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  osVersion?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(300)
  apiEndpoint?: string;

  @IsOptional()
  @IsIn(NETWORK_MANAGEMENT_PROTOCOLS)
  managementProtocol?: NetworkManagementProtocol;

  @IsOptional()
  @IsBoolean()
  managementEnabled?: boolean;

  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(300)
  controllerEndpoint?: string;
}

export class UpdateRouterDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  vendor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;

  @IsOptional()
  @IsIP()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  macAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  osVersion?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsBoolean()
  clearLocation?: boolean;

  @IsOptional()
  @IsBoolean()
  apiEnabled?: boolean;

  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(300)
  apiEndpoint?: string;

  @IsOptional()
  @IsIn(NETWORK_MANAGEMENT_PROTOCOLS)
  managementProtocol?: NetworkManagementProtocol;

  @IsOptional()
  @IsBoolean()
  managementEnabled?: boolean;

  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(300)
  controllerEndpoint?: string;
}

export class RouterHeartbeatDto {
  @IsOptional()
  @IsIn(['ONLINE', 'DEGRADED', 'OFFLINE'])
  status?: 'ONLINE' | 'DEGRADED' | 'OFFLINE';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  activeUsers?: number;
}
