import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CreateVoucherBatchDto {
  @IsUUID() packageId!: string;
  @IsInt() @Min(1) @Max(10000) quantity!: number;
  @IsOptional() @IsInt() @Min(60) @Max(31536000) expiresInSeconds?: number;
  @IsOptional() @IsIn(['LETTERS_NUMBERS','NUMBERS','LETTERS']) codeFormat?: 'LETTERS_NUMBERS'|'NUMBERS'|'LETTERS';
  @IsOptional() @IsIn(['MINI','A4','THERMAL']) printSize?: 'MINI'|'A4'|'THERMAL';
  @IsOptional() @IsIn(['CLASSIC','COMPACT','BRANDED']) printStyle?: 'CLASSIC'|'COMPACT'|'BRANDED';
}

export class RedeemVoucherDto {
  @IsUUID() customerId!: string;
  @IsOptional() @IsUUID() routerId?: string;
}
