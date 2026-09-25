import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreateInvoiceDto {
  @IsUUID() customerId!: string;
  @IsOptional() @IsUUID() purchaseId?: string;
  @IsOptional() @IsString() invoiceNumber?: string;
  @IsString() currency!: string;
  @IsNumber() @Min(0) subtotal!: number;
  @IsNumber() @Min(0) taxTotal!: number;
  @IsOptional() @IsString() dueAt?: string;
}
export class CreateLedgerAccountDto {
  @IsString() @MinLength(2) code!: string;
  @IsString() @MinLength(2) name!: string;
  @IsString() accountType!: string;
  @IsString() currency!: string;
}
export class CreateResellerDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(2) code!: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsNumber() @Min(0) commissionRate?: number;
  @IsOptional() @IsString() settlementCurrency?: string;
}
export class CreateCommissionDto {
  @IsUUID() resellerId!: string;
  @IsUUID() paymentId!: string;
}
export class CreateRefundDto {
  @IsUUID() paymentId!: string;
  @IsNumber() @Min(0.000001) amount!: number;
  @IsString() @MinLength(3) reason!: string;
}
export class CreateAdjustmentDto {
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() purchaseId?: string;
  @IsNumber() @Min(0.000001) amount!: number;
  @IsString() currency!: string;
  @IsString() direction!: string;
  @IsString() @MinLength(3) reason!: string;
}
export class CreateDisputeDto {
  @IsUUID() paymentId!: string;
  @IsOptional() @IsString() providerCaseId?: string;
  @IsOptional() @IsNumber() @Min(0.000001) amount?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() reasonCode?: string;
  @IsOptional() @IsString() reason?: string;
}
export class ReconcileDto {
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsString() currency?: string;
  @IsString() periodStart!: string;
  @IsString() periodEnd!: string;
}
export class TaxRateDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsNumber() @Min(0) rate!: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() countryCode?: string;
  @IsOptional() @IsBoolean() isInclusive?: boolean;
}

export class CreateInvoiceLineDto {
  @IsString() @MinLength(2) description!: string;
  @IsNumber() @Min(0.000001) quantity!: number;
  @IsNumber() @Min(0) unitPrice!: number;
  @IsNumber() @Min(0) taxAmount!: number;
  @IsOptional() @IsUUID() taxRateId?: string;
}
