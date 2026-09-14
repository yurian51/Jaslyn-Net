import { IsIP, IsUUID } from 'class-validator';

export class EnforceRouterPolicyDto {
  @IsUUID()
  packageId!: string;

  @IsIP()
  ipAddress!: string;
}
