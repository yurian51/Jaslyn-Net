import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { SubscriptionsService } from './subscriptions.service';

@Controller('platform-subscriptions')
@UseGuards(AuthGuard, RolesGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get('plans')
  catalogue() {
    return this.subscriptions.catalogue();
  }

  @Get('current')
  current(@Req() req: AuthenticatedRequest) {
    return this.subscriptions.current(req.user!.tenantId);
  }
}
