import { IsInt, Min } from 'class-validator';
export class SetTenantUsageLimitDto {
  @IsInt() @Min(0) limitCount!: number;
}
