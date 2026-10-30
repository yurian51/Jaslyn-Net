import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CreateAutomationRuleDto, ResolveAutomationAlertDto, SetAutomationEnabledDto } from './automation.dto';
import { AutomationService } from './automation.service';

@Controller('automation')
@UseGuards(AuthGuard,RolesGuard,PermissionsGuard)
export class AutomationController {
  constructor(private readonly automation:AutomationService){}
  @Get('rules') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('automation.read')
  rules(@Req() r:AuthenticatedRequest){return this.automation.listRules(r.user!.tenantId);}
  @Post('rules') @Roles('OWNER','ADMIN') @Permissions('automation.manage')
  createRule(@Req() r:AuthenticatedRequest,@Body() d:CreateAutomationRuleDto){return this.automation.createRule(r.user!.tenantId,r.user!.id,d);}
  @Patch('rules/:id/enabled') @Roles('OWNER','ADMIN') @Permissions('automation.manage')
  setEnabled(@Req() r:AuthenticatedRequest,@Param('id') id:string,@Body() d:SetAutomationEnabledDto){return this.automation.setEnabled(r.user!.tenantId,r.user!.id,id,d.enabled);}
  @Get('runs') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('automation.read')
  runs(@Req() r:AuthenticatedRequest){return this.automation.listRuns(r.user!.tenantId);}
  @Get('alerts') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('automation.read')
  alerts(@Req() r:AuthenticatedRequest){return this.automation.listAlerts(r.user!.tenantId);}
  @Post('alerts/:id/resolve') @Roles('OWNER','ADMIN') @Permissions('automation.manage')
  resolveAlert(@Req() r:AuthenticatedRequest,@Param('id') id:string,@Body() d:ResolveAutomationAlertDto){return this.automation.resolveAlert(r.user!.tenantId,r.user!.id,id,d.note);}
}
