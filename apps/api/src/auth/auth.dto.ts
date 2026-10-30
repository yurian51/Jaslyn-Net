import { IsBoolean, IsEmail, IsIn, IsString, Length, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @Length(2, 160)
  businessName!: string;

  @IsString()
  @Length(2, 160)
  fullName!: string;

  @IsEmail()
  email!: string;

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
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
