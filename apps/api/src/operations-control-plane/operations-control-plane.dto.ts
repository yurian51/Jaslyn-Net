import { IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength, IsDateString } from 'class-validator';

export const CONTROL_RECORD_TYPES = ['CONFIG_SNAPSHOT','CHANGE_PLAN','TICKET','RUNBOOK','INTEGRATION','ASSET','MAINTENANCE','SECURITY_EVENT','BACKUP_DRILL','COMMUNICATION','REVENUE_FINDING','SLA_EVENT','FIELD_WORK_ORDER'] as const;
export class CreateControlRecordDto {
  @IsIn(CONTROL_RECORD_TYPES) recordType!: typeof CONTROL_RECORD_TYPES[number];
  @IsString() @MinLength(2) @MaxLength(180) title!: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsIn(['OPEN','IN_PROGRESS','RESOLVED','CLOSED','BLOCKED','APPROVAL_REQUIRED']) status?: string;
  @IsOptional() @IsIn(['LOW','NORMAL','HIGH','CRITICAL']) priority?: string;
  @IsOptional() @IsString() @MaxLength(80) resourceType?: string;
  @IsOptional() @IsUUID() resourceId?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(200) idempotencyKey?: string;
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
}
export class UpdateControlRecordDto {
  @IsOptional() @IsIn(['OPEN','IN_PROGRESS','RESOLVED','CLOSED','BLOCKED','APPROVAL_REQUIRED']) status?: string;
  @IsOptional() @IsIn(['LOW','NORMAL','HIGH','CRITICAL']) priority?: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}
export class UpsertTopologyNodeDto {
  @IsIn(['ROUTER','SWITCH','OLT','ACCESS_POINT','SITE','LINK','SERVER']) nodeType!: string;
  @IsOptional() @IsUUID() resourceId?: string;
  @IsString() @MinLength(1) @MaxLength(180) name!: string;
  @IsOptional() @IsIn(['UP','DEGRADED','DOWN','UNKNOWN']) status?: string;
  @IsOptional() @IsDateString() observedAt?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
export class CreateTopologyEdgeDto {
  @IsUUID() sourceNodeId!: string;
  @IsUUID() targetNodeId!: string;
  @IsOptional() @IsString() @MaxLength(80) relation?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
