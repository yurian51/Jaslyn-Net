import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { SetTenantUsageLimitDto } from './tenant-usage.dto';
import { TenantUsageService } from './tenant-usage.service';

@Controller('msp/usage')
@UseGuards(AuthGuard,RolesGuard,PermissionsGuard)
export class TenantUsageController {
  constructor(private readonly usage:TenantUsageService){}
  @Get() @Roles('OWNER','ADMIN','READ_ONLY') @Permissions('msp.usage.read')
  overview(@Req() r:AuthenticatedRequest){return this.usage.overview(r.user!.tenantId);}
  @Get('limits') @Roles('OWNER','ADMIN','READ_ONLY') @Permissions('msp.usage.read')
  limits(@Req() r:AuthenticatedRequest){return this.usage.listLimits(r.user!.tenantId);}
  @Put('limits/:metricKey') @Roles('OWNER','ADMIN') @Permissions('msp.usage.manage')
  setLimit(@Req() r:AuthenticatedRequest,@Param('metricKey') metricKey:string,@Body() d:SetTenantUsageLimitDto){return this.usage.setLimit(r.user!.tenantId,r.user!.id,metricKey,d);}
}
