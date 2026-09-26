import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreatePurchaseDto {
  @IsUUID()
  customerId!: string;

  @IsUUID()
  packageId!: string;

  @IsOptional()
  @IsUUID()
  routerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  promoCode?: string;
}

export class CreatePurchaseFromTierDto {
  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsUUID()
  routerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  promoCode?: string;
}

export class ConfirmPurchasePaymentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  provider!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  providerReference!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotencyKey?: string;

  @IsOptional()
  @IsIn(['SUCCESS', 'FAILED'])
  status?: 'SUCCESS' | 'FAILED';
}
