import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { EnforceRouterPolicyDto } from './enforce-router-policy.dto';
import { CreateRouterDto, RouterHeartbeatDto, UpdateRouterDto } from './routers.dto';
import { NetworkEnforcementService } from './network-enforcement.service';
import { RoutersService } from './routers.service';

@Controller('routers')
@UseGuards(AuthGuard, RolesGuard)
export class RoutersController {
  constructor(
    private readonly routers: RoutersService,
    private readonly enforcement: NetworkEnforcementService,
  ) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.routers.list(req.user!.tenantId);
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

  @Post('maintenance/mark-stale-offline')
  @Roles('OWNER', 'ADMIN')
  markStaleOffline(@Req() req: AuthenticatedRequest, @Query('minutes') minutes?: string) {
    return this.routers.markOfflineStale(req.user!.tenantId, Number(minutes ?? 5), { userId: req.user!.id });
  }
}
