import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../../auth/auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { TrafficOrchestratorService } from './traffic-orchestrator.service';

@Controller('traffic')
@UseGuards(AuthGuard, RolesGuard)
export class TrafficOrchestratorController {
  constructor(private readonly orchestrator: TrafficOrchestratorService) {}

  @Get('routers/:routerId/evaluate')
  @Roles('OWNER', 'ADMIN', 'NETWORK_ADMIN', 'NOC_ENGINEER')
  evaluate(
    @Req() req: AuthenticatedRequest,
    @Param('routerId') routerId: string,
    @Query('apply') apply?: string,
  ) {
    return this.orchestrator.evaluateRouter(req.user!.tenantId, routerId, apply !== 'false');
  }
}
