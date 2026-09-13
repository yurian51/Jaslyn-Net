import { Transform } from 'class-transformer';
import { IsDateString, IsNumberString, IsOptional, IsUUID, Matches } from 'class-validator';

const decimalCounter = ({ value }: { value: unknown }) => String(value ?? '');

export class RecordTrafficSampleDto {
  @IsUUID()
  routerId!: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @Transform(decimalCounter)
  @IsNumberString()
  @Matches(/^\d+$/)
  bytesIn!: string;

  @Transform(decimalCounter)
  @IsNumberString()
  @Matches(/^\d+$/)
  bytesOut!: string;

  @IsDateString()
  sampledAt!: string;
}
