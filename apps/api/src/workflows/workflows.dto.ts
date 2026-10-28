import { IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateWorkflowDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsIn(['MANUAL','EVENT','SCHEDULE','WEBHOOK']) triggerType!: 'MANUAL'|'EVENT'|'SCHEDULE'|'WEBHOOK';
  @IsOptional() @IsObject() triggerConfig?: Record<string, unknown>;
  @IsArray() steps!: unknown[];
  @IsOptional() @IsBoolean() enabled?: boolean;
}
export class SetWorkflowEnabledDto { @IsBoolean() enabled!: boolean; }
export class TriggerWorkflowDto { @IsOptional() @IsObject() payload?: Record<string, unknown>; @IsOptional() @IsString() @MaxLength(200) idempotencyKey?: string; }
export class DecideWorkflowApprovalDto { @IsIn(['APPROVED','REJECTED']) decision!: 'APPROVED'|'REJECTED'; @IsString() @MinLength(3) @MaxLength(1000) note!: string; }
export class CreateIntegrationDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsIn(['WEBHOOK','REST_API','SMS','PAYMENT','NETWORK_CONTROLLER']) providerType!: 'WEBHOOK'|'REST_API'|'SMS'|'PAYMENT'|'NETWORK_CONTROLLER';
  @IsOptional() @IsString() @MaxLength(2048) baseUrl?: string;
  @IsOptional() @IsString() @MaxLength(120) secretRef?: string;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
  @IsOptional() @IsBoolean() enabled?: boolean;
}
