import { IsObject, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
export class CreateTenantSecretDto {
  @IsString() @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,99}$/) secretKey!: string;
  @IsString() @MinLength(2) @MaxLength(160) displayName!: string;
  @IsString() @MinLength(2) @MaxLength(120) purpose!: string;
  @IsString() @MinLength(1) @MaxLength(10000) secretValue!: string;
  @IsOptional() @IsObject() metadata?: Record<string,unknown>;
}
