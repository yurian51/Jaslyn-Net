import { IsBoolean, IsIP, IsIn, IsInt, IsOptional, IsString, IsUUID, IsUrl, Max, MaxLength, Min } from 'class-validator';

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
