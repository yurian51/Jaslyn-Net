import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength, Matches } from 'class-validator';

export class CreateAutomationRuleDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsString() @MaxLength(120) @Matches(/^([A-Za-z][A-Za-z0-9_.-]{1,119}|\*)$/) eventType!: string;
  @IsArray() @ArrayMaxSize(20) conditions!: unknown[];
  @IsArray() @ArrayMaxSize(10) actions!: unknown[];
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsObject() scope?: Record<string, unknown>;
  @IsOptional() @IsInt() @Min(0) @Max(604800) cooldownSeconds?: number;
  @IsOptional() @IsIn(['RULE', 'SUBJECT']) cooldownScope?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) maxAttempts?: number;
  @IsOptional() @IsInt() @Min(1000) @Max(120000) timeoutMs?: number;
  @IsOptional() @IsInt() @Min(1) @Max(10) maxConcurrency?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) extraPermissions?: string[];
  @IsOptional() @IsIn(['APPROVAL_REQUIRED', 'AUTO']) autonomy?: string;
}
export class SetAutomationEnabledDto {
  @IsBoolean() enabled!: boolean;
}
export class ResolveAutomationAlertDto {
  @IsString() @MinLength(3) @MaxLength(1000) note!: string;
}
export class AutomationNoteDto {
  @IsString() @MinLength(3) @MaxLength(1000) note!: string;
}
