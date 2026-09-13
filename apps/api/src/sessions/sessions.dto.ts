import { IsIP, IsInt, IsMACAddress, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class StartSessionDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  routerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  username?: string;

  @IsOptional()
  @IsIP()
  ipAddress?: string;

  @IsOptional()
  @IsMACAddress()
  macAddress?: string;
}

export class UpdateSessionUsageDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  bytesIn?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  bytesOut?: number;
}
