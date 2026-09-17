import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../../auth/auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { CreateLoadBalancePolicyDto, CreateWanConnectionDto, LoadBalanceActionDto, UpdateWanConnectionDto, WanHealthCheckDto } from './load-balancing.dto';
import { LoadBalancingService } from './load-balancing.service';

@Controller('load-balancing')
@UseGuards(AuthGuard, RolesGuard)
export class LoadBalancingController {
  constructor(private readonly loadBalancing: LoadBalancingService) {}

  @Get('wan')
  listWans(@Req() req: AuthenticatedRequest, @Query('routerId') routerId?: string) {
    return this.loadBalancing.listWans(req.user!.tenantId, routerId);
  }

  @Post('wan')
  @Roles('OWNER', 'ADMIN')
  createWan(@Req() req: AuthenticatedRequest, @Body() dto: CreateWanConnectionDto) {
    return this.loadBalancing.createWan(req.user!.tenantId, dto, { userId: req.user!.id });
  }

  @Patch('wan/:id')
  @Roles('OWNER', 'ADMIN')
  updateWan(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateWanConnectionDto) {
    return this.loadBalancing.updateWan(req.user!.tenantId, id, dto, { userId: req.user!.id });
  }

  @Get('policies')
  listPolicies(@Req() req: AuthenticatedRequest, @Query('routerId') routerId?: string) {
    return this.loadBalancing.listPolicies(req.user!.tenantId, routerId);
  }

  @Get('policies/:id')
  getPolicy(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.loadBalancing.getPolicy(req.user!.tenantId, id);
  }

  @Post('policies')
  @Roles('OWNER', 'ADMIN')
  createPolicy(@Req() req: AuthenticatedRequest, @Body() dto: CreateLoadBalancePolicyDto) {
    return this.loadBalancing.createPolicy(req.user!.tenantId, dto, { userId: req.user!.id });
  }

  @Get('policies/:id/status')
  status(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.loadBalancing.status(req.user!.tenantId, id);
  }

  @Post('policies/:id/rebalance')
  @Roles('OWNER', 'ADMIN')
  rebalance(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: LoadBalanceActionDto = {}) {
    return this.loadBalancing.rebalance(req.user!.tenantId, id, { userId: req.user!.id }, dto);
  }

  @Post('wan/:id/health-checks')
  @Roles('OWNER', 'ADMIN')
  healthCheck(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: WanHealthCheckDto) {
    return this.loadBalancing.addHealthCheck(req.user!.tenantId, id, dto, { userId: req.user!.id });
  }
}
