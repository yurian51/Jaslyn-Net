import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCaptivePortalSettingsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  welcomeMessage?: string;

  @IsString()
  @MaxLength(10000)
  termsText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  supportPhone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  supportEmail?: string;
}
