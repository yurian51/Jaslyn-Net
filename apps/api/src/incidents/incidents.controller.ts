import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { IncidentsService } from './incidents.service';
import { AssignIncidentOwnerDto, CreateMaintenanceWindowDto, SetIncidentPublicVisibilityDto, UpdateStatusPageComponentDto, UpdateStatusPageSettingsDto } from './incidents.dto';

class ResolveIncidentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  resolution!: string;
}

class IncidentListQuery {
  @IsOptional()
  @IsIn(['OPEN', 'ACKNOWLEDGED', 'RESOLVED'])
  status?: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
}

@Controller('incidents')
@UseGuards(AuthGuard, RolesGuard, PermissionsGuard)
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'CASHIER', 'AGENT', 'READ_ONLY')
  @Permissions('incident.read')
  list(@Req() req: AuthenticatedRequest, @Query() query: IncidentListQuery) {
    return this.incidents.list(req.user!.tenantId, query.status);
  }

  @Get('owners')
  @Roles('OWNER', 'ADMIN', 'AGENT')
  @Permissions('incident.manage')
  listAssignableOwners(@Req() req:AuthenticatedRequest) {
    return this.incidents.listAssignableOwners(req.user!.tenantId);
  }

  @Get('reports/sla')
  @Roles('OWNER', 'ADMIN', 'AGENT', 'READ_ONLY', 'CASHIER')
  @Permissions('incident.read')
  slaReport(@Req() req:AuthenticatedRequest,@Query('from') from?:string,@Query('to') to?:string) {
    return this.incidents.getSlaReport(req.user!.tenantId,from,to);
  }

  @Get('maintenance-windows')
  @Roles('OWNER', 'ADMIN', 'AGENT', 'READ_ONLY')
  @Permissions('maintenance.read')
  listMaintenanceWindows(@Req() req: AuthenticatedRequest) {
    return this.incidents.listMaintenanceWindows(req.user!.tenantId);
  }

  @Post('maintenance-windows')
  @Roles('OWNER', 'ADMIN')
  @Permissions('maintenance.manage')
  createMaintenanceWindow(@Req() req: AuthenticatedRequest, @Body() dto: CreateMaintenanceWindowDto) {
    return this.incidents.createMaintenanceWindow(req.user!.tenantId, req.user!.id, dto, {
      userId: req.user!.id, requestId: req.requestId, ipAddress: req.ip,
      userAgent: Array.isArray(req.headers['user-agent']) ? req.headers['user-agent'][0] : req.headers['user-agent'],
    });
  }

  @Post('maintenance-windows/:id/cancel')
  @Roles('OWNER', 'ADMIN')
  @Permissions('maintenance.manage')
  cancelMaintenanceWindow(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.incidents.cancelMaintenanceWindow(req.user!.tenantId, id, {
      userId: req.user!.id, requestId: req.requestId, ipAddress: req.ip,
    });
  }

  @Get('status-page')
  @Roles('OWNER', 'ADMIN')
  @Permissions('status.manage')
  getStatusPageSettings(@Req() req: AuthenticatedRequest) {
    return this.incidents.getStatusPageSettings(req.user!.tenantId);
  }

  @Put('status-page')
  @Roles('OWNER', 'ADMIN')
  @Permissions('status.manage')
  updateStatusPageSettings(@Req() req: AuthenticatedRequest, @Body() dto: UpdateStatusPageSettingsDto) {
    return this.incidents.updateStatusPageSettings(req.user!.tenantId, req.user!.id, dto, {
      userId: req.user!.id, requestId: req.requestId, ipAddress: req.ip,
    });
  }

  @Put('status-page/components/:componentKey')
  @Roles('OWNER', 'ADMIN')
  @Permissions('status.manage')
  updateStatusPageComponent(@Req() req: AuthenticatedRequest, @Param('componentKey') componentKey: string, @Body() dto: UpdateStatusPageComponentDto) {
    return this.incidents.updateStatusPageComponent(req.user!.tenantId, req.user!.id, componentKey, dto, {
      userId: req.user!.id, requestId: req.requestId, ipAddress: req.ip,
    });
  }

  @Get(':id')
  @Roles('OWNER', 'ADMIN', 'CASHIER', 'AGENT', 'READ_ONLY')
  @Permissions('incident.read')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.incidents.get(req.user!.tenantId, id);
  }

  @Post('routers/:routerId/sync-offline')
  @Roles('OWNER', 'ADMIN', 'AGENT')
  @Permissions('incident.manage')
  syncRouterOffline(@Req() req: AuthenticatedRequest, @Param('routerId') routerId: string) {
    return this.incidents.syncRouterOffline(req.user!.tenantId, routerId, { userId: req.user!.id, requestId: req.requestId });
  }

  @Put(':id/owner')
  @Roles('OWNER', 'ADMIN', 'AGENT')
  @Permissions('incident.manage')
  assignOwner(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: AssignIncidentOwnerDto) {
    return this.incidents.assignOwner(req.user!.tenantId, id, dto, {
      userId: req.user!.id, requestId: req.requestId, ipAddress: req.ip,
    });
  }

  @Put(':id/public-visibility')
  @Roles('OWNER', 'ADMIN')
  @Permissions('status.manage')
  setPublicVisibility(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: SetIncidentPublicVisibilityDto) {
    return this.incidents.setPublicVisibility(req.user!.tenantId, id, dto, {
      userId: req.user!.id, requestId: req.requestId, ipAddress: req.ip,
    });
  }

  @Post(':id/acknowledge')
  @Roles('OWNER', 'ADMIN', 'AGENT')
  @Permissions('incident.manage')
  acknowledge(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.incidents.acknowledge(req.user!.tenantId, id, { userId: req.user!.id, requestId: req.requestId });
  }

  @Post(':id/resolve')
  @Roles('OWNER', 'ADMIN', 'AGENT')
  @Permissions('incident.manage')
  resolve(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: ResolveIncidentDto) {
    return this.incidents.resolve(req.user!.tenantId, id, dto.resolution, { userId: req.user!.id, requestId: req.requestId });
  }
}
