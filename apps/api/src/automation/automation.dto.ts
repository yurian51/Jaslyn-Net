import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength, Matches } from 'class-validator';

export class CreateAutomationRuleDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsString() @MaxLength(120) @Matches(/^([A-Z][A-Z0-9_.-]{1,119}|\*)$/) eventType!: string;
  @IsArray() @ArrayMaxSize(20) conditions!: unknown[];
  @IsArray() @ArrayMaxSize(10) actions!: unknown[];
  @IsOptional() @IsBoolean() enabled?: boolean;
}
export class SetAutomationEnabledDto {
  @IsBoolean() enabled!: boolean;
}
export class ResolveAutomationAlertDto {
  @IsString() @MinLength(3) @MaxLength(1000) note!: string;
}
