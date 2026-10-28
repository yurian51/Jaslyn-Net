import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Length, MinLength, ValidateIf } from 'class-validator';

export class RegisterDto {
  @IsString()
  @Length(2, 160)
  businessName!: string;

  @IsString()
  @Length(2, 160)
  fullName!: string;

  @IsEmail()
  email!: string;

  /** Optional mobile number; lets the owner sign in with it. */
  @IsOptional()
  @IsString()
  @Length(7, 24)
  phone?: string;

  @IsString()
  @MinLength(12)
  password!: string;

  @IsBoolean()
  acceptTerms!: boolean;

  @IsBoolean()
  acceptPrivacy!: boolean;
}

export class LegalAcceptanceDto {
  @IsString()
  @IsIn(['TERMS_OF_USE', 'PRIVACY_NOTICE'])
  documentType!: 'TERMS_OF_USE' | 'PRIVACY_NOTICE';
}

export class LoginDto {
  /** Email address or mobile number. Preferred over `email`. */
  @IsOptional()
  @IsString()
  @Length(3, 160)
  identifier?: string;

  /** Legacy field kept so existing clients keep working. */
  @ValidateIf((o: LoginDto) => !o.identifier)
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class PasswordResetRequestDto {
  @IsEmail()
  email!: string;
}

export class PasswordResetConfirmDto {
  @IsString()
  @Length(43, 43)
  token!: string;

  @IsString()
  @MinLength(12)
  password!: string;
}
