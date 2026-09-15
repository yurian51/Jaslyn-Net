import { Body, Get, Param, Patch, Post, Query, Req, UseGuards, Controller } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionsService } from './sessions.service';
import { StartSessionDto, UpdateSessionUsageDto } from './sessions.dto';

@Controller('sessions')
@UseGuards(AuthGuard, RolesGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query('status') status?: 'ACTIVE' | 'STALE' | 'ENDED', @Query('limit') limit?: string) {
    return this.sessions.list(req.user!.tenantId, status, Number(limit ?? 100));
  }

  @Get(':id')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.sessions.get(req.user!.tenantId, id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'AGENT')
  start(@Req() req: AuthenticatedRequest, @Body() dto: StartSessionDto) {
    return this.sessions.start(req.user!.tenantId, dto, { userId: req.user!.id, requestId: req.requestId });
  }

  @Patch(':id/usage')
  @Roles('OWNER', 'ADMIN', 'AGENT')
  updateUsage(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateSessionUsageDto) {
    return this.sessions.updateUsage(req.user!.tenantId, id, dto);
  }

  @Post(':id/end')
  @Roles('OWNER', 'ADMIN', 'AGENT')
  end(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.sessions.end(req.user!.tenantId, id, { userId: req.user!.id, requestId: req.requestId });
  }

  @Post('maintenance/reconcile-stale')
  @Roles('OWNER', 'ADMIN')
  reconcileStale(@Req() req: AuthenticatedRequest, @Query('minutes') minutes?: string) {
    return this.sessions.reconcileStale(req.user!.tenantId, Number(minutes ?? 30));
  }

  @Post('maintenance/reconcile-access')
  @Roles('OWNER', 'ADMIN')
  reconcileAccess(@Req() req: AuthenticatedRequest) {
    return this.sessions.reconcileAccessState(req.user!.tenantId, { userId: req.user!.id, requestId: req.requestId });
  }
}
