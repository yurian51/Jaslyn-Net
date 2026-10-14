import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { OperationsHubService } from './operations-hub.service';

@Controller('operations-hub')
@UseGuards(AuthGuard, RolesGuard, PermissionsGuard)
export class OperationsHubController {
  constructor(private readonly hub: OperationsHubService) {}
  @Get('artifacts') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('automation.read')
  artifacts(@Req() r: AuthenticatedRequest) { return this.hub.listArtifacts(r.user!.tenantId,r.user!.id); }
  @Post('artifacts') @Roles('OWNER','ADMIN','AGENT') @Permissions('automation.manage')
  createArtifact(@Req() r: AuthenticatedRequest,@Body() b: unknown) { return this.hub.createArtifact(r.user!.tenantId,r.user!.id,b); }
  @Post('artifacts/:id/restore/:version') @Roles('OWNER','ADMIN','AGENT') @Permissions('automation.manage')
  restoreArtifactVersion(@Req() r: AuthenticatedRequest,@Param('id') id: string,@Param('version') version: string) { return this.hub.restoreArtifactVersion(r.user!.tenantId,r.user!.id,id,Number(version)); }
  @Get('artifacts/:id/versions') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('automation.read')
  artifactHistory(@Req() r: AuthenticatedRequest,@Param('id') id: string) { return this.hub.artifactHistory(r.user!.tenantId,r.user!.id,id); }
  @Post('artifacts/:id/versions') @Roles('OWNER','ADMIN','AGENT') @Permissions('automation.manage')
  versionArtifact(@Req() r: AuthenticatedRequest,@Param('id') id: string,@Body() b: unknown) { return this.hub.versionArtifact(r.user!.tenantId,r.user!.id,id,b); }
  @Get('workspaces') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('automation.read')
  workspaces(@Req() r: AuthenticatedRequest) { return this.hub.listWorkspaces(r.user!.tenantId,r.user!.id); }
  @Post('workspaces') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('automation.read')
  saveWorkspace(@Req() r: AuthenticatedRequest,@Body() b: unknown) { return this.hub.saveWorkspace(r.user!.tenantId,r.user!.id,b); }

  @Patch('runbooks/:id/activate') @Roles('OWNER','ADMIN') @Permissions('automation.manage')
  activateRunbook(@Req() r: AuthenticatedRequest,@Param('id') id: string) { return this.hub.activateRunbook(r.user!.tenantId,r.user!.id,id); }
  @Get('runbook-executions') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('automation.read')
  runbookExecutions(@Req() r: AuthenticatedRequest) { return this.hub.listRunbookExecutions(r.user!.tenantId); }
  @Post('runbook-executions/:id/review') @Roles('OWNER','ADMIN') @Permissions('automation.manage')
  reviewRunbookExecution(@Req() r: AuthenticatedRequest,@Param('id') id: string,@Body() b: unknown) { return this.hub.reviewRunbookExecution(r.user!.tenantId,r.user!.id,id,b); }
  @Get('change-reviews/:id/evidence') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('automation.read')
  changeEvidence(@Req() r: AuthenticatedRequest,@Param('id') id: string) { return this.hub.listChangeEvidence(r.user!.tenantId,id); }
  @Post('change-reviews/:id/evidence') @Roles('OWNER','ADMIN','AGENT') @Permissions('automation.manage')
  addChangeEvidence(@Req() r: AuthenticatedRequest,@Param('id') id: string,@Body() b: unknown) { return this.hub.addChangeEvidence(r.user!.tenantId,r.user!.id,id,b); }

  @Get('runbooks') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('automation.read')
  runbooks(@Req() r: AuthenticatedRequest) { return this.hub.listRunbooks(r.user!.tenantId); }
  @Post('runbooks') @Roles('OWNER','ADMIN') @Permissions('automation.manage')
  createRunbook(@Req() r: AuthenticatedRequest,@Body() b: unknown) { return this.hub.createRunbook(r.user!.tenantId,r.user!.id,b); }
  @Post('runbooks/:id/executions') @Roles('OWNER','ADMIN') @Permissions('automation.manage')
  executeRunbook(@Req() r: AuthenticatedRequest,@Param('id') id: string,@Body() b: unknown) { return this.hub.executeRunbook(r.user!.tenantId,r.user!.id,id,b); }
  @Get('integrations') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('automation.read')
  integrations(@Req() r: AuthenticatedRequest) { return this.hub.listIntegrations(r.user!.tenantId); }
  @Post('integrations') @Roles('OWNER','ADMIN') @Permissions('automation.manage')
  saveIntegration(@Req() r: AuthenticatedRequest,@Body() b: unknown) { return this.hub.saveIntegration(r.user!.tenantId,r.user!.id,b); }
  @Get('change-reviews') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('automation.read')
  changes(@Req() r: AuthenticatedRequest) { return this.hub.listChanges(r.user!.tenantId); }
  @Post('change-reviews') @Roles('OWNER','ADMIN','AGENT') @Permissions('automation.manage')
  createChange(@Req() r: AuthenticatedRequest,@Body() b: unknown) { return this.hub.createChange(r.user!.tenantId,r.user!.id,b); }
  @Post('change-reviews/:id/review') @Roles('OWNER','ADMIN') @Permissions('automation.manage')
  reviewChange(@Req() r: AuthenticatedRequest,@Param('id') id: string,@Body() b: unknown) { return this.hub.reviewChange(r.user!.tenantId,r.user!.id,id,b); }
}