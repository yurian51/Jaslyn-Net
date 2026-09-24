import { IsBoolean, IsIn, IsInt, IsOptional, IsPhoneNumber, IsString, Matches, Max, Min } from 'class-validator';

export class UpdateUpesiLipaSiteDto {
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  primaryColor?: string;

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  secondaryColor?: string;

  @IsOptional()
  @IsPhoneNumber(undefined)
  supportPhone?: string;

  @IsOptional()
  @IsIn(['MINIMAL', 'DARK', 'BOLD', 'COASTAL', 'MARKET'])
  portalTheme?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86400)
  gracePeriodSeconds?: number;

  @IsOptional()
  @IsBoolean()
  healthCheckEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
