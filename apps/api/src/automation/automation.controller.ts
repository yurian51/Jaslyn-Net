import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { AutomationNoteDto, CreateAutomationRuleDto, ResolveAutomationAlertDto, SetAutomationEnabledDto } from './automation.dto';
import { AutomationOpsService } from './automation.ops.service';
import { AutomationService } from './automation.service';

const READ = ['OWNER', 'ADMIN', 'AGENT', 'READ_ONLY'];
const ADMINS = ['OWNER', 'ADMIN'];

@Controller('automation')
@UseGuards(AuthGuard, RolesGuard, PermissionsGuard)
export class AutomationController {
  constructor(private readonly automation: AutomationService, private readonly ops: AutomationOpsService) {}

  // ---- rules
  @Get('rules') @Roles(...READ) @Permissions('automation.read')
  rules(@Req() r: AuthenticatedRequest) { return this.automation.listRules(r.user!.tenantId); }
  @Post('rules') @Roles(...ADMINS) @Permissions('automation.manage')
  createRule(@Req() r: AuthenticatedRequest, @Body() d: CreateAutomationRuleDto) { return this.automation.createRule(r.user!.tenantId, r.user!.id, d); }
  @Put('rules/:id') @Roles(...ADMINS) @Permissions('automation.manage')
  updateRule(@Req() r: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: CreateAutomationRuleDto) { return this.automation.updateRule(r.user!.tenantId, r.user!.id, id, d); }
  @Patch('rules/:id/enabled') @Roles(...ADMINS) @Permissions('automation.manage')
  setEnabled(@Req() r: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: SetAutomationEnabledDto) { return this.automation.setEnabled(r.user!.tenantId, r.user!.id, id, d.enabled); }
  @Post('rules/:id/standing-approval') @Roles(...ADMINS) @Permissions('automation.approve')
  grantStanding(@Req() r: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: AutomationNoteDto) { return this.automation.grantStandingApproval(r.user!.tenantId, { userId: r.user!.id, role: r.user!.role }, id, d.note); }
  @Post('rules/:id/standing-approval/revoke') @Roles(...ADMINS) @Permissions('automation.approve')
  revokeStanding(@Req() r: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: AutomationNoteDto) { return this.automation.revokeStandingApproval(r.user!.tenantId, r.user!.id, id, d.note); }

  // ---- evaluation trail and alerts
  @Get('runs') @Roles(...READ) @Permissions('automation.read')
  runs(@Req() r: AuthenticatedRequest) { return this.automation.listRuns(r.user!.tenantId); }
  @Get('alerts') @Roles(...READ) @Permissions('automation.read')
  alerts(@Req() r: AuthenticatedRequest) { return this.automation.listAlerts(r.user!.tenantId); }
  @Post('alerts/:id/resolve') @Roles(...ADMINS) @Permissions('automation.manage')
  resolveAlert(@Req() r: AuthenticatedRequest, @Param('id') id: string, @Body() d: ResolveAutomationAlertDto) { return this.automation.resolveAlert(r.user!.tenantId, r.user!.id, id, d.note); }

  // ---- operational visibility
  @Get('catalog') @Roles(...READ) @Permissions('automation.read')
  catalog() { return this.ops.catalog(); }
  @Get('ops/overview') @Roles(...READ) @Permissions('automation.read')
  overview(@Req() r: AuthenticatedRequest) { return this.ops.overview(r.user!.tenantId); }
  @Get('jobs') @Roles(...READ) @Permissions('automation.read')
  jobs(@Req() r: AuthenticatedRequest, @Query('status') status?: string, @Query('ruleId') ruleId?: string, @Query('eventType') eventType?: string, @Query('limit') limit?: string, @Query('before') before?: string) {
    return this.ops.listJobs(r.user!.tenantId, { status, ruleId, eventType, limit: limit ? Number(limit) : undefined, before });
  }
  @Get('jobs/:id') @Roles(...READ) @Permissions('automation.read')
  job(@Req() r: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { return this.ops.getJob(r.user!.tenantId, id); }
  @Post('jobs/:id/cancel') @Roles(...ADMINS) @Permissions('automation.operate')
  cancel(@Req() r: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: AutomationNoteDto) { return this.ops.cancelJob(r.user!.tenantId, { userId: r.user!.id, role: r.user!.role }, id, d.note); }
  @Post('jobs/:id/approve') @Roles(...ADMINS) @Permissions('automation.approve')
  approve(@Req() r: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: AutomationNoteDto) { return this.ops.decideApproval(r.user!.tenantId, { userId: r.user!.id, role: r.user!.role }, id, true, d.note); }
  @Post('jobs/:id/reject') @Roles(...ADMINS) @Permissions('automation.approve')
  reject(@Req() r: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: AutomationNoteDto) { return this.ops.decideApproval(r.user!.tenantId, { userId: r.user!.id, role: r.user!.role }, id, false, d.note); }

  @Get('dead-letters') @Roles(...READ) @Permissions('automation.read')
  deadLetters(@Req() r: AuthenticatedRequest, @Query('status') status?: string, @Query('limit') limit?: string) { return this.ops.listDeadLetters(r.user!.tenantId, status, limit ? Number(limit) : undefined); }
  @Post('dead-letters/:id/requeue') @Roles(...ADMINS) @Permissions('automation.operate')
  requeue(@Req() r: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: AutomationNoteDto) { return this.ops.requeueDeadLetter(r.user!.tenantId, { userId: r.user!.id, role: r.user!.role }, id, d.note); }
  @Post('dead-letters/:id/dismiss') @Roles(...ADMINS) @Permissions('automation.operate')
  dismiss(@Req() r: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: AutomationNoteDto) { return this.ops.dismissDeadLetter(r.user!.tenantId, { userId: r.user!.id, role: r.user!.role }, id, d.note); }
}
