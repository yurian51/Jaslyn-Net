import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../../auth/auth.guard';
import { TrafficOrchestratorService } from './traffic-orchestrator.service';

@Controller('traffic')
@UseGuards(AuthGuard)
export class TrafficOrchestratorController {
  constructor(private readonly orchestrator: TrafficOrchestratorService) {}

  @Get('routers/:routerId/evaluate')
  evaluate(
    @Req() req: AuthenticatedRequest,
    @Param('routerId') routerId: string,
    @Query('apply') apply?: string,
  ) {
    return this.orchestrator.evaluateRouter(req.user!.tenantId, routerId, apply !== 'false');
  }
}
