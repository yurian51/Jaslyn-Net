import { IsString, MaxLength, MinLength } from 'class-validator';

export class PublicVoucherRedemptionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @IsString()
  @MinLength(7)
  @MaxLength(32)
  phone!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(32)
  code!: string;
}
