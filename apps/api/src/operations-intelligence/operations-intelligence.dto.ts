import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, Matches } from 'class-validator';

export class CreateNetworkTelemetryDto {
  @IsIn(['ROUTER','INTERFACE','ACCESS_POINT','LINK','SITE']) resourceType!: string;
  @IsUUID() resourceId!: string;
  @IsIn(['RX_BPS','TX_BPS','LATENCY_MS','JITTER_MS','PACKET_LOSS_PCT','UTILIZATION_PCT','CLIENT_COUNT','CHANNEL_UTILIZATION_PCT','AIRTIME_PCT','RSSI_DBM']) metricType!: string;
  @IsNumber() metricValue!: number;
  @IsString() @MinLength(1) @MaxLength(32) unit!: string;
  @IsString() @MinLength(2) @MaxLength(80) source!: string;
  @IsDateString() sampledAt!: string;
  @IsString() @MinLength(8) @MaxLength(200) idempotencyKey!: string;
}
export class CreateWifiExperienceDto {
  @IsUUID() routerId!: string;
  @IsString() @Matches(/^[a-f0-9]{64}$/i) clientKeyHash!: string;
  @IsOptional() @IsString() @MaxLength(120) ssid?: string;
  @IsOptional() @IsIn(['2.4GHz','5GHz','6GHz','UNKNOWN']) band?: string;
  @IsOptional() @IsNumber() @Min(1) @Max(1000) channel?: number;
  @IsOptional() @IsNumber() @Min(-150) @Max(0) rssiDbm?: number;
  @IsOptional() @IsNumber() @Min(-150) @Max(0) noiseDbm?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) airtimePct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) channelUtilizationPct?: number;
  @IsOptional() @IsNumber() @Min(0) txRateBps?: number;
  @IsOptional() @IsNumber() @Min(0) rxRateBps?: number;
  @IsOptional() @IsNumber() @Min(0) roamingCount?: number;
  @IsDateString() sampledAt!: string;
  @IsString() @MinLength(8) @MaxLength(200) idempotencyKey!: string;
}
export class CreatePowerSampleDto {
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsUUID() assetId?: string;
  @IsIn(['UPS_BATTERY_PCT','UPS_LOAD_PCT','TEMPERATURE_C','HUMIDITY_PCT','GENERATOR_STATUS','MAINS_VOLTAGE_V','POWER_DRAW_W']) metricType!: string;
  @IsNumber() metricValue!: number;
  @IsString() @MinLength(1) @MaxLength(32) unit!: string;
  @IsString() @MinLength(2) @MaxLength(80) source!: string;
  @IsDateString() sampledAt!: string;
  @IsString() @MinLength(8) @MaxLength(200) idempotencyKey!: string;
}
export class UpsertDeviceLifecycleDto {
  @IsIn(['ROUTER','SWITCH','ACCESS_POINT','FIREWALL','UPS','SERVER','OTHER']) resourceType!: string;
  @IsUUID() resourceId!: string;
  @IsString() @MinLength(2) @MaxLength(100) vendor!: string;
  @IsString() @MinLength(1) @MaxLength(120) model!: string;
  @IsOptional() @IsString() @MaxLength(120) serialNumber?: string;
  @IsOptional() @IsString() @MaxLength(120) firmwareVersion?: string;
  @IsOptional() @IsDateString() purchasedAt?: string;
  @IsOptional() @IsDateString() warrantyExpiresAt?: string;
  @IsOptional() @IsDateString() endOfSaleAt?: string;
  @IsOptional() @IsDateString() endOfSupportAt?: string;
  @IsOptional() @IsIn(['UNKNOWN','CURRENT','PATCH_REQUIRED','CRITICAL','NOT_APPLICABLE']) vulnerabilityStatus?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class CreateSlaPolicyDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(80) serviceCode?: string;
  @IsNumber() @Min(0.001) @Max(100) targetUptimePct!: number;
  @IsNumber() @Min(1) @Max(100000) responseMinutes!: number;
  @IsNumber() @Min(1) @Max(200000) resolutionMinutes!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) serviceCreditPct?: number;
}
