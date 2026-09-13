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
  @Max(9223372036854775807)
  bytesIn?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9223372036854775807)
  bytesOut?: number;
}
