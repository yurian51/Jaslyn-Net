import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateSyntheticMonitorDto } from './synthetic-monitoring.dto';
import { SetSyntheticMonitorEnabledDto } from './set-synthetic-monitor-enabled.dto';
import { SyntheticMonitoringService } from './synthetic-monitoring.service';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';

@Controller('synthetic-monitors')
@UseGuards(AuthGuard,RolesGuard,PermissionsGuard)
export class SyntheticMonitoringController {
  constructor(private readonly monitors:SyntheticMonitoringService){}
  @Get() @Roles('OWNER','ADMIN','AGENT','READ_ONLY','NOC_ENGINEER') @Permissions('synthetic.read')
  list(@Req() req:AuthenticatedRequest){return this.monitors.list(req.user!.tenantId);}
  @Post() @Roles('OWNER','ADMIN') @Permissions('synthetic.write')
  create(@Req() req:AuthenticatedRequest,@Body() dto:CreateSyntheticMonitorDto){
    return this.monitors.create(req.user!.tenantId,req.user!.id,dto,{userId:req.user!.id,requestId:req.requestId,ipAddress:req.ip});
  }
  @Post(':id/check') @Roles('OWNER','ADMIN','AGENT','NOC_ENGINEER') @Permissions('synthetic.check')
  check(@Req() req:AuthenticatedRequest,@Param('id') id:string){return this.monitors.checkNow(req.user!.tenantId,id);}
  @Get(':id/history') @Roles('OWNER','ADMIN','AGENT','READ_ONLY','NOC_ENGINEER') @Permissions('synthetic.read')
  history(@Req() req:AuthenticatedRequest,@Param('id') id:string){return this.monitors.history(req.user!.tenantId,id);}
  @Patch(':id/enabled') @Roles('OWNER','ADMIN') @Permissions('synthetic.write')
  enabled(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() dto:SetSyntheticMonitorEnabledDto){
    return this.monitors.setEnabled(req.user!.tenantId,id,dto.enabled,{userId:req.user!.id,requestId:req.requestId,ipAddress:req.ip});
  }
}
