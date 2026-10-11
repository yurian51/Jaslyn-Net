import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { SubscriptionService } from './subscription.service';

@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subscription: SubscriptionService) {}

  @Get('plans')
  plans() {
    return this.subscription.plans();
  }

  @Get('current')
  @UseGuards(AuthGuard)
  current(@Req() req: AuthenticatedRequest) {
    return this.subscription.current(req.user!.tenantId);
  }

  @Get('usage')
  @UseGuards(AuthGuard)
  usage(@Req() req: AuthenticatedRequest) {
    return this.subscription.usage(req.user!.tenantId);
  }

  @Get('feature/:key')
  @UseGuards(AuthGuard)
  feature(@Req() req: AuthenticatedRequest, @Param('key') key: string) {
    return this.subscription.feature(req.user!.tenantId, key);
  }
}
