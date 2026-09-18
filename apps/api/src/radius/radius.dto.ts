import { IsBoolean, IsIn, IsIP, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateRadiusNasDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsIP() address!: string;
  @IsString() @MinLength(8) @MaxLength(256) secret!: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class SetRadiusCredentialDto {
  @IsUUID() accessBindingId!: string;
  @IsString() @MinLength(1) @MaxLength(256) password!: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class DisconnectRadiusSessionDto {
  @IsUUID() nasClientId!: string;
  @IsString() @MinLength(1) @MaxLength(253) username!: string;
  @IsOptional() @IsString() @MaxLength(253) acctSessionId?: string;
}
