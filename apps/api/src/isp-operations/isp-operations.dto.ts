import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsLatitude, IsLongitude, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export enum ServiceState { PENDING='PENDING', ACTIVE='ACTIVE', GRACE='GRACE', SUSPENDED='SUSPENDED', BLOCKED='BLOCKED', DISCONNECTED='DISCONNECTED', FAULT='FAULT' }
export enum AccessType { PPPOE='PPPOE', HOTSPOT='HOTSPOT', RADIUS='RADIUS', STATIC='STATIC', OTHER='OTHER' }
export enum AccessState { PENDING='PENDING', ACTIVE='ACTIVE', SUSPENDED='SUSPENDED', DISABLED='DISABLED', EXPIRED='EXPIRED' }
export enum JobType { INSTALLATION='INSTALLATION', REPAIR='REPAIR', MAINTENANCE='MAINTENANCE', ACTIVATION='ACTIVATION', DISCONNECTION='DISCONNECTION', INSPECTION='INSPECTION', OTHER='OTHER' }
export enum JobStatus { OPEN='OPEN', ASSIGNED='ASSIGNED', IN_PROGRESS='IN_PROGRESS', BLOCKED='BLOCKED', COMPLETED='COMPLETED', CANCELED='CANCELED' }
export enum JobPriority { LOW='LOW', NORMAL='NORMAL', HIGH='HIGH', CRITICAL='CRITICAL' }
export enum SiteType { POP='POP', OLT='OLT', NAP='NAP', TOWER='TOWER', HOTSPOT='HOTSPOT', OFFICE='OFFICE', WAREHOUSE='WAREHOUSE', OTHER='OTHER' }
export enum SiteStatus { ACTIVE='ACTIVE', DEGRADED='DEGRADED', OFFLINE='OFFLINE', MAINTENANCE='MAINTENANCE' }
export enum FiberServiceStatus { PLANNED='PLANNED', ACTIVE='ACTIVE', SUSPENDED='SUSPENDED', FAULT='FAULT', DISCONNECTED='DISCONNECTED' }

export class CreateAccessBindingDto {
  @IsUUID() customerId!: string; @IsOptional() @IsUUID() routerId?: string; @IsOptional() @IsUUID() packageId?: string;
  @IsString() @MinLength(1) @MaxLength(120) username!: string; @IsEnum(AccessType) accessType!: AccessType;
  @IsOptional() @IsString() @MaxLength(160) externalReference?: string; @IsOptional() @IsISO8601() expiresAt?: string;
}
export class ChangeAccessStateDto { @IsEnum(AccessState) state!: AccessState; @IsString() @MinLength(2) @MaxLength(500) reason!: string; @IsOptional() @IsUUID() paymentId?: string; }
export class ChangeCustomerServiceStateDto {
  @IsEnum(ServiceState) state!: ServiceState; @IsString() @MinLength(2) @MaxLength(500) reason!: string;
  @IsOptional() @IsString() @MaxLength(80) source?: string; @IsOptional() @IsISO8601() effectiveAt?: string; @IsOptional() @IsISO8601() expiresAt?: string;
}
export class CreateNetworkJobDto {
  @IsOptional() @IsUUID() customerId?: string; @IsOptional() @IsUUID() siteId?: string; @IsOptional() @IsUUID() assignedUserId?: string;
  @IsEnum(JobType) jobType!: JobType; @IsOptional() @IsEnum(JobPriority) priority?: JobPriority;
  @IsString() @MinLength(2) @MaxLength(180) title!: string; @IsOptional() @IsString() @MaxLength(5000) description?: string; @IsOptional() @IsISO8601() scheduledAt?: string;
}
export class UpdateNetworkJobDto {
  @IsOptional() @IsUUID() assignedUserId?: string; @IsOptional() @IsEnum(JobPriority) priority?: JobPriority; @IsOptional() @IsEnum(JobStatus) status?: JobStatus;
  @IsOptional() @IsString() @MaxLength(5000) description?: string; @IsOptional() @IsISO8601() scheduledAt?: string; @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
export class CreateNetworkSiteDto {
  @IsOptional() @IsUUID() locationId?: string; @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsOptional() @IsEnum(SiteType) siteType?: SiteType; @IsOptional() @IsEnum(SiteStatus) status?: SiteStatus; @IsOptional() @IsUUID() parentSiteId?: string;
  @IsOptional() @IsLatitude() latitude?: number; @IsOptional() @IsLongitude() longitude?: number;
}
export class CreateFiberLineDto {
  @IsOptional() @IsUUID() customerId?: string; @IsOptional() @IsUUID() locationId?: string; @IsOptional() @IsUUID() routerId?: string;
  @IsString() @MinLength(2) @MaxLength(160) name!: string; @IsOptional() @IsString() @MaxLength(40) technology?: string;
  @IsOptional() @IsEnum(FiberServiceStatus) serviceStatus?: FiberServiceStatus; @IsOptional() @IsInt() @Min(0) upstreamBps?: number; @IsOptional() @IsInt() @Min(0) downstreamBps?: number;
  @IsOptional() @IsString() @MaxLength(500) installationAddress?: string; @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class ListQueryDto {
  @Transform(({ value }) => value === undefined || value === '' ? 1 : Number(value)) @IsInt() @Min(1) @Max(10000) page = 1;
  @Transform(({ value }) => value === undefined || value === '' ? 25 : Number(value)) @IsInt() @Min(1) @Max(100) limit = 25;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
}
