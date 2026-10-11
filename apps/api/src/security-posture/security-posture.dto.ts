import { IsIn, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateNetworkPolicyDto {
  @IsString() @Matches(/^[a-z0-9][a-z0-9._-]{1,99}$/) policyKey!: string;
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsIn(['TENANT','ROUTER']) scopeType!: 'TENANT'|'ROUTER';
  @IsOptional() @IsUUID() scopeId?: string;
  @IsObject() desiredState!: Record<string, unknown>;
  @IsIn(['MONITOR','REQUIRE_APPROVAL']) enforcementMode!: 'MONITOR'|'REQUIRE_APPROVAL';
}

export class UpdateComplianceFindingDto {
  @IsIn(['RESOLVED','ACCEPTED']) status!: 'RESOLVED'|'ACCEPTED';
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
