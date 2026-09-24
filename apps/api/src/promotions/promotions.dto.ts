import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

export class CreatePromoCodeDto {
  @IsString()
  @MinLength(2)
  code!: string;

  @IsIn(['PERCENTAGE', 'FIXED'])
  type!: 'PERCENTAGE' | 'FIXED';

  @IsNumber()
  @Min(0.01)
  @Max(1000000000)
  value!: number;

  @IsOptional()
  @IsString()
  expiresAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimitTotal?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimitPerCustomer?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscount?: number;

  @IsOptional()
  @IsUUID('4', { each: true })
  eligiblePackageIds?: string[];

  @IsOptional()
  @IsBoolean()
  firstPaymentOnly?: boolean;
}

export class ValidatePromoCodeDto {
  @IsString()
  @MinLength(2)
  code!: string;

  @IsUUID()
  customerId!: string;

  @IsUUID()
  packageId!: string;

  @IsNumber()
  @Min(0)
  subtotal!: number;
}
