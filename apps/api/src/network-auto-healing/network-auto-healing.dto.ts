import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export class UpdateNetworkAutoHealingPolicyDto {
  @IsBoolean() enabled!: boolean;
  @IsInt() @Min(1) @Max(3) maxAutoRetries!: number;
  @IsInt() @Min(30) @Max(3600) cooldownSeconds!: number;
}
