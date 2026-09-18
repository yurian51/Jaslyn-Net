import { IsIn, IsOptional, IsString, MaxLength, MinLength, Matches } from 'class-validator';

export class SalesPeriodDto {
  @IsOptional() @IsIn(['today','week','month','all'])
  period: 'today'|'week'|'month'|'all' = 'month';

  @IsOptional() @Matches(/^\\d{4}-\\d{2}$/)
  month?: string;
}

export class SalesSearchDto {
  @IsString() @MinLength(2) @MaxLength(160)
  q!: string;
}
