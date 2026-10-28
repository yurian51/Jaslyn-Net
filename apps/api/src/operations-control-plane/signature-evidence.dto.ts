import { IsDateString, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, Matches } from 'class-validator';

export class CreateSignatureEvidenceDto {
  @IsString() @MinLength(2) @MaxLength(80) @Matches(/^[A-Z0-9_.:-]+$/) evidenceType!: string;
  @IsString() @MinLength(2) @MaxLength(80) @Matches(/^[A-Z0-9_.:-]+$/) subjectType!: string;
  @IsString() @MinLength(1) @MaxLength(180) subjectId!: string;
  @IsString() @MinLength(2) @MaxLength(80) @Matches(/^[A-Z0-9_.:-]+$/) sourceType!: string;
  @IsOptional() @IsString() @MaxLength(240) sourceRef?: string;
  @IsDateString() observedAt!: string;
  @IsOptional() @IsNumber() @Min(0) @Max(1) confidence?: number;
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(200) idempotencyKey?: string;
}
export class LinkSignatureEvidenceDto {
  @IsUUID() fromEvidenceId!: string;
  @IsUUID() toEvidenceId!: string;
  @IsString() @MinLength(2) @MaxLength(80) @Matches(/^[A-Z0-9_.:-]+$/) relation!: string;
}
