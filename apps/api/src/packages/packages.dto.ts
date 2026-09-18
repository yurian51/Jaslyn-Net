import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

const toInt = ({ value }: { value: unknown }) => value === undefined || value === '' ? value : Number(value);
const toBoolean = ({ value }: { value: unknown }) => value === undefined || value === '' ? value : value === true || value === 'true';

export class ListPackagesQueryDto {
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @Transform(toInt) @IsOptional() @IsInt() @Min(1) @Max(10000) page = 1;
  @Transform(toInt) @IsOptional() @IsInt() @Min(1) @Max(100) limit = 25;
  @Transform(toBoolean) @IsOptional() @IsBoolean() activeOnly?: boolean;
  @Transform(toBoolean) @IsOptional() @IsBoolean() portalOnly?: boolean;
}

export class CreatePackageDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price!: number;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsInt() @Min(1) durationSeconds!: number;
  @IsOptional() @IsInt() @Min(1) dataLimitBytes?: number;
  @IsOptional() @IsInt() @Min(1) downloadBps?: number;
  @IsOptional() @IsInt() @Min(1) uploadBps?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) devicesPerCode?: number;
  @IsOptional() @IsBoolean() showOnPortal?: boolean;
  @IsOptional() @IsBoolean() isFreeTrial?: boolean;
  @IsOptional() @IsIn(['ONCE_PER_PHONE','ONCE_PER_CUSTOMER','UNLIMITED']) freeTrialFrequency?: 'ONCE_PER_PHONE'|'ONCE_PER_CUSTOMER'|'UNLIMITED';
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdatePackageDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price?: number;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() @IsInt() @Min(1) durationSeconds?: number;
  @IsOptional() @IsInt() @Min(1) dataLimitBytes?: number;
  @IsOptional() @IsInt() @Min(1) downloadBps?: number;
  @IsOptional() @IsInt() @Min(1) uploadBps?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) devicesPerCode?: number;
  @IsOptional() @IsBoolean() showOnPortal?: boolean;
  @IsOptional() @IsBoolean() isFreeTrial?: boolean;
  @IsOptional() @IsIn(['ONCE_PER_PHONE','ONCE_PER_CUSTOMER','UNLIMITED']) freeTrialFrequency?: 'ONCE_PER_PHONE'|'ONCE_PER_CUSTOMER'|'UNLIMITED';
  @IsOptional() @IsBoolean() isActive?: boolean;
}
