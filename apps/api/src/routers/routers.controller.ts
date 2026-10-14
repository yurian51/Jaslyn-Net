import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { EnforceRouterPolicyDto } from './enforce-router-policy.dto';
import { CreateRouterDto, RouterHeartbeatDto, UpdateRouterDto } from './routers.dto';
import { NetworkEnforcementService } from './network-enforcement.service';
import { RoutersService } from './routers.service';
import { FirmwareObservationInput, NetworkFirmwareInventoryService } from './network-firmware-inventory.service';
import { FirmwareUpgradeRequest, NetworkFirmwareUpgradeService } from './network-firmware-upgrade.service';

@Controller('routers')
@UseGuards(AuthGuard, RolesGuard, PermissionsGuard)
export class RoutersController {
  constructor(
    private readonly routers: RoutersService,
    private readonly enforcement: NetworkEnforcementService,
    private readonly firmware: NetworkFirmwareInventoryService,
    private readonly firmwareUpgrades: NetworkFirmwareUpgradeService,
  ) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.routers.list(req.user!.tenantId);
  }

  @Get('change-intelligence')
  @Roles('OWNER', 'ADMIN', 'AGENT', 'READ_ONLY')
  @Permissions('network.changes.read')
  changeIntelligence(@Req() req: AuthenticatedRequest, @Query('routerId') routerId?: string, @Query('limit') limit?: string) {
    return this.routers.changeIntelligence(req.user!.tenantId, routerId, Number(limit) || 100);
  }


  @Get(':id/firmware')
  @Roles('OWNER', 'ADMIN', 'AGENT', 'READ_ONLY')
  firmwareStatus(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.firmware.list(req.user!.tenantId, id);
  }

  @Post(':id/firmware/observation')
  @Roles('OWNER', 'ADMIN', 'AGENT')
  observeFirmware(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: FirmwareObservationInput) {
    const userAgent = req.headers['user-agent'];
    return this.firmware.observe(req.user!.tenantId, id, dto, {
      userId: req.user!.id,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    });
  }

  @Get(':id/firmware/live')
  @Roles('OWNER', 'ADMIN', 'AGENT')
  inspectLiveFirmware(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userAgent = req.headers['user-agent'];
    return this.firmwareUpgrades.inspectLive(req.user!.tenantId, id, {
      userId: req.user!.id, requestId: req.requestId, ipAddress: req.ip,
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    });
  }

  @Get(':id/firmware/upgrades')
  @Roles('OWNER', 'ADMIN', 'AGENT', 'READ_ONLY')
  listFirmwareUpgrades(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.firmwareUpgrades.list(req.user!.tenantId, id);
  }

  @Post(':id/firmware/upgrades/preview')
  @Roles('OWNER', 'ADMIN')
  previewFirmwareUpgrade(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: FirmwareUpgradeRequest) {
    const userAgent = req.headers['user-agent'];
    return this.firmwareUpgrades.preview(req.user!.tenantId, id, dto, {
      userId: req.user!.id, requestId: req.requestId, ipAddress: req.ip,
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    });
  }

  @Post(':id/firmware/upgrades/:jobId/approve')
  @Roles('OWNER', 'ADMIN')
  approveFirmwareUpgrade(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('jobId') jobId: string) {
    return this.firmwareUpgrades.approve(req.user!.tenantId, id, jobId, { userId: req.user!.id, requestId: req.requestId, ipAddress: req.ip });
  }

  @Get(':id')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.routers.get(req.user!.tenantId, id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateRouterDto) {
    return this.routers.create(req.user!.tenantId, dto, { userId: req.user!.id });
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateRouterDto) {
    return this.routers.update(req.user!.tenantId, id, dto, { userId: req.user!.id });
  }

  @Post(':id/heartbeat')
  @Roles('OWNER', 'ADMIN', 'AGENT')
  heartbeat(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: RouterHeartbeatDto) {
    return this.routers.heartbeat(req.user!.tenantId, id, dto, { userId: req.user!.id });
  }

  @Post(':id/enforce-policy')
  @Roles('OWNER', 'ADMIN', 'AGENT')
  enforcePolicy(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: EnforceRouterPolicyDto) {
    return this.enforcement.enforce(req.user!.tenantId, id, dto, { userId: req.user!.id });
  }

  @Post('maintenance/rotate-credentials')
  @Roles('OWNER', 'ADMIN')
  rotateCredentials(@Req() req: AuthenticatedRequest) {
    const userAgent = req.headers['user-agent'];
    return this.routers.rotateCredentials(req.user!.tenantId, {
      userId: req.user!.id,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    });
  }

  @Post('maintenance/mark-stale-offline')
  @Roles('OWNER', 'ADMIN')
  markStaleOffline(@Req() req: AuthenticatedRequest, @Query('minutes') minutes?: string) {
    return this.routers.markOfflineStale(req.user!.tenantId, Number(minutes ?? 5), { userId: req.user!.id });
  }
}
