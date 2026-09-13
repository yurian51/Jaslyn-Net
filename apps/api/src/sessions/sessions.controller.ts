import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { SessionsService } from './sessions.service';
import { StartSessionDto, UpdateSessionUsageDto } from './sessions.dto';

@Controller('sessions')
@UseGuards(AuthGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query('status') status?: 'ACTIVE' | 'ENDED', @Query('limit') limit?: string) {
    return this.sessions.list(req.user!.tenantId, status, Number(limit ?? 100));
  }

  @Get(':id')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.sessions.get(req.user!.tenantId, id);
  }

  @Post()
  start(@Req() req: AuthenticatedRequest, @Body() dto: StartSessionDto) {
    return this.sessions.start(req.user!.tenantId, dto, { userId: req.user!.userId, requestId: req.requestId });
  }

  @Patch(':id/usage')
  updateUsage(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateSessionUsageDto) {
    return this.sessions.updateUsage(req.user!.tenantId, id, dto);
  }

  @Post(':id/end')
  end(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.sessions.end(req.user!.tenantId, id, { userId: req.user!.userId, requestId: req.requestId });
  }

  @Post('maintenance/reconcile-stale')
  reconcileStale(@Req() req: AuthenticatedRequest, @Query('minutes') minutes?: string) {
    return this.sessions.reconcileStale(req.user!.tenantId, Number(minutes ?? 30));
  }
}
