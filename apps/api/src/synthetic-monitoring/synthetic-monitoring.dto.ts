import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateSyntheticMonitorDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsIn(['HTTP','DNS','CAPTIVE_PORTAL']) checkType!: 'HTTP'|'DNS'|'CAPTIVE_PORTAL';
  @IsString() @MinLength(3) @MaxLength(2048) target!: string;
  @IsOptional() @IsInt() @Min(100) @Max(599) expectedStatus?: number;
  @IsOptional() @IsInt() @Min(30) @Max(3600) intervalSeconds?: number;
}
