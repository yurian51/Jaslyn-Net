import { IsBoolean, IsIP, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

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
  locationId?: string | null;

  @IsOptional()
  @IsBoolean()
  apiEnabled?: boolean;
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
