import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CreateIntegrationDto, CreateWorkflowDto, DecideWorkflowApprovalDto, SetWorkflowEnabledDto, TriggerWorkflowDto } from './workflows.dto';
import { WorkflowsService } from './workflows.service';

@Controller('automation/workflows')
@UseGuards(AuthGuard, RolesGuard, PermissionsGuard)
export class WorkflowsController {
  constructor(private readonly workflows:WorkflowsService) {}
  @Get() @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('automation.workflow.read')
  list(@Req() r:AuthenticatedRequest){return this.workflows.list(r.user!.tenantId);}
  @Post() @Roles('OWNER','ADMIN') @Permissions('automation.workflow.manage')
  create(@Req() r:AuthenticatedRequest,@Body() d:CreateWorkflowDto){return this.workflows.create(r.user!.tenantId,r.user!.id,d);}
  @Get(':id/versions') @Roles('OWNER','ADMIN') @Permissions('automation.workflow.read')
  versions(@Req() r:AuthenticatedRequest,@Param('id') id:string){return this.workflows.listVersions(r.user!.tenantId,id);}
  @Put(':id/definition') @Roles('OWNER','ADMIN') @Permissions('automation.workflow.manage')
  updateDefinition(@Req() r:AuthenticatedRequest,@Param('id') id:string,@Body() d:CreateWorkflowDto){return this.workflows.updateDefinition(r.user!.tenantId,r.user!.id,id,d);}
  @Get(':id/export') @Roles('OWNER','ADMIN') @Permissions('automation.workflow.manage')
  exportDefinition(@Req() r:AuthenticatedRequest,@Param('id') id:string){return this.workflows.exportDefinition(r.user!.tenantId,id);}
  @Post('import') @Roles('OWNER','ADMIN') @Permissions('automation.workflow.manage')
  importDefinition(@Req() r:AuthenticatedRequest,@Body() d:CreateWorkflowDto){return this.workflows.importDefinition(r.user!.tenantId,r.user!.id,d);}
  @Patch(':id/enabled') @Roles('OWNER','ADMIN') @Permissions('automation.workflow.manage')
  setEnabled(@Req() r:AuthenticatedRequest,@Param('id') id:string,@Body() d:SetWorkflowEnabledDto){return this.workflows.setEnabled(r.user!.tenantId,r.user!.id,id,d.enabled);}
  @Post(':id/run') @Roles('OWNER','ADMIN','AGENT') @Permissions('automation.workflow.manage')
  run(@Req() r:AuthenticatedRequest,@Param('id') id:string,@Body() d:TriggerWorkflowDto){return this.workflows.triggerManual(r.user!.tenantId,r.user!.id,id,d.payload??{},d.idempotencyKey);}
  @Get('runs/:id') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('automation.workflow.read')
  runDetail(@Req() r:AuthenticatedRequest,@Param('id') id:string){return this.workflows.getRun(r.user!.tenantId,id);}
  @Post('runs/:id/replay') @Roles('OWNER','ADMIN') @Permissions('automation.workflow.manage')
  replayRun(@Req() r:AuthenticatedRequest,@Param('id') id:string){return this.workflows.replayRun(r.user!.tenantId,r.user!.id,id);}
  @Patch('runs/:id/cancel') @Roles('OWNER','ADMIN') @Permissions('automation.workflow.manage')
  cancelRun(@Req() r:AuthenticatedRequest,@Param('id') id:string){return this.workflows.cancelRun(r.user!.tenantId,r.user!.id,id);}
  @Get('runs') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('automation.workflow.read')
  runs(@Req() r:AuthenticatedRequest){return this.workflows.listRuns(r.user!.tenantId);}
  @Get('alerts') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('automation.workflow.read')
  alerts(@Req() r:AuthenticatedRequest){return this.workflows.listAlerts(r.user!.tenantId);}
  @Get('approvals') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('automation.workflow.read')
  approvals(@Req() r:AuthenticatedRequest){return this.workflows.listApprovals(r.user!.tenantId);}
  @Post('approvals/:id/decision') @Roles('OWNER','ADMIN') @Permissions('automation.workflow.approve')
  decide(@Req() r:AuthenticatedRequest,@Param('id') id:string,@Body() d:DecideWorkflowApprovalDto){return this.workflows.decideApproval(r.user!.tenantId,r.user!.id,id,d.decision,d.note);}
  @Get('integrations') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('automation.workflow.read')
  integrations(@Req() r:AuthenticatedRequest){return this.workflows.listIntegrations(r.user!.tenantId);}
  @Patch('integrations/:id/enabled') @Roles('OWNER','ADMIN') @Permissions('automation.workflow.manage')
  setIntegrationEnabled(@Req() r:AuthenticatedRequest,@Param('id') id:string,@Body() d:SetWorkflowEnabledDto){return this.workflows.setIntegrationEnabled(r.user!.tenantId,r.user!.id,id,d.enabled);}
  @Post('integrations') @Roles('OWNER','ADMIN') @Permissions('automation.workflow.manage')
  createIntegration(@Req() r:AuthenticatedRequest,@Body() d:CreateIntegrationDto){return this.workflows.createIntegration(r.user!.tenantId,r.user!.id,d);}
}

@Controller('automation/workflows')
export class WorkflowWebhookController {
  constructor(private readonly workflows:WorkflowsService) {}
  @Post(':id/webhook')
  webhook(@Param('id') id:string,@Headers('x-jaslyn-webhook-token') token:string,@Body() payload:Record<string,unknown>) {
    if(!payload||typeof payload!=='object'||Array.isArray(payload)) throw new BadRequestException('Webhook body must be a JSON object');
    return this.workflows.triggerWebhook(id,token,payload);
  }
}
