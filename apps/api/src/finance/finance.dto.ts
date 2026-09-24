import { IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreateInvoiceDto {
  @IsUUID() customerId!: string;
  @IsOptional() @IsUUID() purchaseId?: string;
  @IsString() @MinLength(2) invoiceNumber!: string;
  @IsString() currency!: string;
  @IsNumber() @Min(0) subtotal!: number;
  @IsNumber() @Min(0) taxTotal!: number;
  @IsOptional() @IsString() dueAt?: string;
}

export class CreateLedgerAccountDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsString() accountType!: string;
  @IsString() currency!: string;
}