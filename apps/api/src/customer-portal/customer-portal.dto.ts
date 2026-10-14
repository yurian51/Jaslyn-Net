import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
export class CustomerPortalCreatePurchaseDto {
  @IsUUID() packageId!: string;
  @IsOptional() @IsUUID() routerId?: string;
  @IsOptional() @IsString() @MaxLength(80) promoCode?: string;
}
export class CustomerPortalLoginDto {
  @IsString() @MinLength(2) @MaxLength(80) tenantSlug!: string;
  @IsString() @MinLength(2) @MaxLength(120) username!: string;
  @IsString() @MinLength(1) @MaxLength(256) password!: string;
}
export class CustomerPortalActivationDto {
  @IsString() @MinLength(32) @MaxLength(128) invitationToken!: string;
  @IsString() @MinLength(12) @MaxLength(256) password!: string;
}
export class CustomerPortalPurchaseIntentDto {
  @IsUUID() purchaseId!: string;
  @IsString() @MinLength(2) @MaxLength(40) provider!: string;
  @IsOptional() @IsString() @MaxLength(160) idempotencyKey?: string;
}
export class CustomerPortalSupportDto {
  @IsString() @MinLength(2) @MaxLength(80) category!: string;
  @IsString() @MinLength(3) @MaxLength(180) subject!: string;
  @IsString() @MinLength(5) @MaxLength(4000) description!: string;
  @IsOptional() @IsString() @MaxLength(10) priority?: 'LOW'|'NORMAL'|'HIGH'|'URGENT';
  @IsOptional() @IsUUID() purchaseId?: string;
  @IsOptional() @IsUUID() paymentId?: string;
}
