import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { OverviewService } from './overview.service';

@Controller('overview')
@UseGuards(AuthGuard)
export class OverviewController {
  constructor(private readonly overview: OverviewService) {}

  @Get()
  getOverview(@Req() request: AuthenticatedRequest) {
    return this.overview.getOverview(request.user!.tenantId);
  }
}
