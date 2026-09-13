import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { CreateRouterDto, RouterHeartbeatDto, UpdateRouterDto } from './routers.dto';
import { RoutersService } from './routers.service';

@Controller('routers')
@UseGuards(AuthGuard)
export class RoutersController {
  constructor(private readonly routers: RoutersService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.routers.list(req.user!.tenantId);
  }

  @Get(':id')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.routers.get(req.user!.tenantId, id);
  }

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateRouterDto) {
    return this.routers.create(req.user!.tenantId, dto);
  }

  @Patch(':id')
  update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateRouterDto) {
    return this.routers.update(req.user!.tenantId, id, dto);
  }

  @Post(':id/heartbeat')
  heartbeat(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: RouterHeartbeatDto) {
    return this.routers.heartbeat(req.user!.tenantId, id, dto);
  }

  @Post('maintenance/mark-stale-offline')
  markStaleOffline(@Req() req: AuthenticatedRequest, @Query('minutes') minutes?: string) {
    return this.routers.markOfflineStale(req.user!.tenantId, Number(minutes ?? 5));
  }
}
