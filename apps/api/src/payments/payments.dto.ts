import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreatePaymentIntentDto {
  @IsUUID()
  purchaseId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  provider!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;
}

export class PaymentWebhookDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  provider!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  providerEventId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  eventType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  providerReference?: string;

  @IsOptional()
  @IsUUID()
  purchaseId?: string;

  @IsOptional()
  @IsUUID()
  paymentId?: string;

  @IsIn(['SUCCESS', 'FAILED', 'REFUNDED'])
  status!: 'SUCCESS' | 'FAILED' | 'REFUNDED';

  @IsOptional()
  payload?: Record<string, unknown>;
}
