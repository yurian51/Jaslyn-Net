import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class BeneficiaryDto {
  @IsString() displayName!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsUUID() beneficiaryCustomerId?: string;
  @IsOptional() @IsUUID() packageId?: string;
  @IsOptional() @IsUUID() routerId?: string;
  @IsOptional() @IsBoolean() isFavorite?: boolean;
}
export class SavedPurchaseDto {
  @IsString() label!: string;
  @IsUUID() packageId!: string;
  @IsOptional() @IsUUID() beneficiaryId?: string;
  @IsOptional() @IsUUID() routerId?: string;
  @IsOptional() @IsBoolean() autoRenew?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(365) renewalDays?: number;
}
export class WalletEntryDto {
  @IsIn(['TOPUP','REFUND','ADJUSTMENT','COMMISSION','PURCHASE','TRANSFER_OUT','TRANSFER_IN']) entryType!: string;
  @Min(0.01) amount!: number;
  @IsString() currency!: string;
  @IsString() idempotencyKey!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() referenceType?: string;
  @IsOptional() @IsUUID() referenceId?: string;
}
export class LimitDto {
  @IsOptional() dailyAmount?: number;
  @IsOptional() dailyTransactions?: number;
  @IsOptional() monthlyAmount?: number;
  @IsOptional() requireVerificationAbove?: number;
}
export class VerificationDto {
  @IsIn(['PHONE','EMAIL','IDENTITY','DEVICE']) verificationType!: string;
  @IsIn(['UNVERIFIED','PENDING','VERIFIED','REJECTED']) status!: string;
  @IsOptional() @IsString() evidenceRef?: string;
}
export class NotificationPreferenceDto {
  @IsOptional() @IsBoolean() transactionAlerts?: boolean;
  @IsOptional() @IsBoolean() accessAlerts?: boolean;
  @IsOptional() @IsBoolean() promotionAlerts?: boolean;
  @IsOptional() @IsBoolean() securityAlerts?: boolean;
  @IsOptional() @IsIn(['SMS','EMAIL','WHATSAPP','WEB']) preferredChannel?: string;
}
export class SupportCaseDto {
  @IsString() category!: string;
  @IsString() subject!: string;
  @IsString() description!: string;
  @IsOptional() @IsIn(['LOW','NORMAL','HIGH','URGENT']) priority?: string;
  @IsOptional() @IsUUID() purchaseId?: string;
  @IsOptional() @IsUUID() paymentId?: string;
}
export class ReferralDto { @IsString() code!: string; }
export class RenewalScheduleDto {
  @IsUUID() savedPurchaseId!: string;
  @IsString() nextRunAt!: string;
  @IsIn(['ACTIVE','PAUSED']) status?: string;
}
