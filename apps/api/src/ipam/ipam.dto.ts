import { IsBoolean, IsIn, IsInt, IsIP, IsJSON, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

const ROLES = ['CUSTOMER','WAN','VLAN','LOOPBACK','MANAGEMENT','OTHER'] as const;
const MODES = ['INVENTORY','DYNAMIC'] as const;
const STATUSES = ['AVAILABLE','RESERVED','ALLOCATED','QUARANTINED'] as const;

export class CreateIpamPoolDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() @MaxLength(64) network!: string;
  @IsOptional() @IsIP() gateway?: string;
  @IsOptional() @IsIn(ROLES) role?: typeof ROLES[number];
  @IsOptional() @IsIn(MODES) allocationMode?: typeof MODES[number];
  @IsOptional() @IsInt() @Min(1) @Max(4094) vlanId?: number;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class AddIpAddressDto {
  @IsIP() address!: string;
  @IsOptional() @IsIn(['AVAILABLE','RESERVED']) status?: 'AVAILABLE' | 'RESERVED';
  @IsOptional() @IsIn(['DYNAMIC','STATIC','RESERVED']) assignmentType?: 'DYNAMIC' | 'STATIC' | 'RESERVED';
  @IsOptional() @IsString() @MaxLength(160) reservationRef?: string;
  @IsOptional() @IsJSON() metadata?: string;
}

export class AllocateIpAddressDto {
  @IsOptional() @IsIP() address?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() routerId?: string;
  @IsOptional() @IsUUID() sessionId?: string;
  @IsOptional() @IsString() @MaxLength(64) macAddress?: string;
  @IsOptional() @IsInt() @Min(60) leaseSeconds?: number;
}

export class ReleaseIpAddressDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class ListIpAddressesQueryDto {
  @IsOptional() @IsIn(STATUSES) status?: typeof STATUSES[number];
  @IsOptional() @IsUUID() poolId?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1000) limit?: number;
}