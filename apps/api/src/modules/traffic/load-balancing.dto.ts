import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsIP, IsNumber, IsOptional, IsString, IsUUID, IsUrl, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { LOAD_BALANCE_STRATEGIES } from './load-balancing.types';

export class CreateWanConnectionDto {
  @IsUUID() routerId!: string;
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(120) provider?: string;
  @IsOptional() @IsString() @MaxLength(120) interfaceName?: string;
  @IsOptional() @IsIP() gateway?: string;
  @IsOptional() @IsString() @MaxLength(64) address?: string;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) capacityMbps!: number;
  @IsOptional() @IsInt() @Min(1) @Max(100000) configuredWeight?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100000) priority?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100000) failoverPriority?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class UpdateWanConnectionDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(120) provider?: string;
  @IsOptional() @IsString() @MaxLength(120) interfaceName?: string;
  @IsOptional() @IsIP() gateway?: string;
  @IsOptional() @IsString() @MaxLength(64) address?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) capacityMbps?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100000) configuredWeight?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100000) priority?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100000) failoverPriority?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() drainRequested?: boolean;
}

export class CreateLoadBalancePolicyDto {
  @IsUUID() routerId!: string;
  @IsString() @MaxLength(120) name!: string;
  @IsIn(LOAD_BALANCE_STRATEGIES) strategy!: typeof LOAD_BALANCE_STRATEGIES[number];
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() capacityAware?: boolean;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100) rebalanceThresholdPercent?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100) degradeThresholdPercent?: number;
  @IsOptional() @IsInt() @Min(1) @Max(20) unavailableAfterFailures?: number;
  @IsOptional() @IsInt() @Min(1) @Max(20) recoverAfterSuccesses?: number;
  @IsOptional() @ValidateNested({ each: true }) @Type(() => LoadBalanceMemberInputDto) members?: LoadBalanceMemberInputDto[];
}

export class LoadBalanceMemberInputDto {
  @IsUUID() wanConnectionId!: string;
  @IsOptional() @IsInt() @Min(1) @Max(100000) configuredWeight?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100000) priority?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class LoadBalanceActionDto {
  @IsOptional() @IsString() @MaxLength(80) reason?: string;
}

export class WanHealthCheckDto {
  @IsIn(['GATEWAY_ICMP','ICMP','TCP','DNS','HTTP','HTTPS']) method!: 'GATEWAY_ICMP' | 'ICMP' | 'TCP' | 'DNS' | 'HTTP' | 'HTTPS';
  @IsString() @MaxLength(500) target!: string;
  @IsOptional() @IsInt() @Min(1) @Max(3600) intervalSeconds?: number;
  @IsOptional() @IsInt() @Min(250) @Max(30000) timeoutMs?: number;
  @IsOptional() @IsInt() @Min(1) @Max(20) failureThreshold?: number;
  @IsOptional() @IsInt() @Min(1) @Max(20) recoveryThreshold?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
}
