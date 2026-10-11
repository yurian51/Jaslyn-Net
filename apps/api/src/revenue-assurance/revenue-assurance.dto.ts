import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
export class UpdateRevenueDiscrepancyDto {
  @IsIn(['RESOLVED','ACCEPTED']) status!: 'RESOLVED'|'ACCEPTED';
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
