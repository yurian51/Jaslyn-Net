import { IsEmail, IsIn, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateSupplierDto {
  @IsString() @MinLength(2) @MaxLength(40) supplierCode!: string;
  @IsString() @MinLength(2) @MaxLength(180) name!: string;
  @IsOptional() @IsString() @MaxLength(80) taxNumber?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
}
export class CreatePurchaseOrderDto {
  @IsUUID() supplierId!: string;
  @IsString() @MinLength(2) @MaxLength(60) poNumber!: string;
  @IsString() @Matches(/^[A-Z]{3}$/) currency!: string;
  @IsOptional() @IsString() expectedAt?: string;
}
export class CreatePurchaseOrderLineDto {
  @IsString() @MinLength(2) @MaxLength(500) description!: string;
  @IsString() @MinLength(1) @MaxLength(80) itemCode!: string;
  @IsNumber() @Min(0.0001) quantityOrdered!: number;
  @IsNumber() @Min(0) unitCost!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) taxRate?: number;
}
export class CreateSupplierInvoiceDto {
  @IsUUID() supplierId!: string;
  @IsOptional() @IsUUID() purchaseOrderId?: string;
  @IsString() @MinLength(1) @MaxLength(100) invoiceNumber!: string;
  @IsString() @Matches(/^[A-Z]{3}$/) currency!: string;
  @IsNumber() @Min(0) subtotal!: number;
  @IsOptional() @IsNumber() @Min(0) taxTotal?: number;
  @IsString() invoiceDate!: string;
  @IsOptional() @IsString() dueDate?: string;
}
export class CreateInventoryItemDto {
  @IsString() @MinLength(1) @MaxLength(80) sku!: string;
  @IsString() @MinLength(2) @MaxLength(180) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() @MaxLength(30) unit?: string;
  @IsOptional() @IsIn(['WEIGHTED_AVERAGE']) valuationMethod?: string;
  @IsOptional() @IsNumber() @Min(0) reorderLevel?: number;
}
export class CreateStockMovementDto {
  @IsIn(['RECEIPT','ISSUE','RETURN','ADJUSTMENT']) movementType!: string;
  @IsNumber() quantityDelta!: number;
  @IsNumber() @Min(0) unitCost!: number;
  @IsString() @Matches(/^[A-Z]{3}$/) currency!: string;
  @IsString() @MinLength(2) @MaxLength(80) referenceType!: string;
  @IsOptional() @IsUUID() referenceId?: string;
  @IsString() @MinLength(8) @MaxLength(200) idempotencyKey!: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
export class UpdateBrandingDto {
  @IsString() @MinLength(2) @MaxLength(120) displayName!: string;
  @IsOptional() @IsString() @MaxLength(500) logoUrl?: string;
  @IsOptional() @IsString() @Matches(/^#[0-9A-Fa-f]{6}$/) primaryColor?: string;
  @IsOptional() @IsEmail() supportEmail?: string;
  @IsOptional() @IsString() @MaxLength(40) supportPhone?: string;
  @IsOptional() @IsString() @MaxLength(253) portalDomain?: string;
}
export class CreateCustomerCreditNoteDto {
  @IsUUID() invoiceId!: string;
  @IsString() @MinLength(2) @MaxLength(80) creditNumber!: string;
  @IsString() @Matches(/^[A-Z]{3}$/) currency!: string;
  @IsNumber() @Min(0.01) amount!: number;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
