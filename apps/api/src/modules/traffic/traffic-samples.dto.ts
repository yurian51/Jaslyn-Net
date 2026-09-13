import { IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class RecordTrafficSampleDto {
  @IsUUID()
  routerId!: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  bytesIn!: number;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  bytesOut!: number;

  @IsDateString()
  sampledAt!: string;
}
