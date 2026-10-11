import { IsBoolean, IsEnum, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export enum MaintenanceScope { TENANT='TENANT', SITE='SITE', ROUTER='ROUTER' }
export enum StatusComponentState { OPERATIONAL='OPERATIONAL', DEGRADED='DEGRADED', PARTIAL_OUTAGE='PARTIAL_OUTAGE', MAJOR_OUTAGE='MAJOR_OUTAGE', MAINTENANCE='MAINTENANCE' }

export class CreateMaintenanceWindowDto {
  @IsString() @MinLength(3) @MaxLength(180) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsEnum(MaintenanceScope) scopeType!: MaintenanceScope;
  @IsOptional() @IsUUID() scopeId?: string;
  @IsISO8601() startsAt!: string;
  @IsISO8601() endsAt!: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsString() @MaxLength(500) publicSummary?: string;
}

export class UpdateStatusPageSettingsDto {
  @IsString() @Matches(/^[a-z0-9][a-z0-9-]{2,62}$/) slug!: string;
  @IsString() @MinLength(2) @MaxLength(120) displayName!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsBoolean() isPublished!: boolean;
}

export class UpdateStatusPageComponentDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsEnum(StatusComponentState) status!: StatusComponentState;
  @IsOptional() @IsString() @MaxLength(500) publicSummary?: string;
}

export class AssignIncidentOwnerDto {
  @IsOptional() @IsUUID() ownerUserId?: string | null;
}

export class SetIncidentPublicVisibilityDto {
  @IsBoolean() visible!: boolean;
  @IsOptional() @IsString() @MaxLength(500) publicSummary?: string;
}
