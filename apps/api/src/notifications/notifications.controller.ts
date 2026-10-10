import { Body, Controller, Get, Headers, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { NotificationsService, SmsCategory } from './notifications.service';
import { BeemSmsProvider } from './sms.provider';

@Controller('notifications')
@UseGuards(AuthGuard, RolesGuard)
@Roles('OWNER', 'ADMIN')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly smsProvider: BeemSmsProvider,
  ) {}

  @Get('outbox')
  list(@Req() req: AuthenticatedRequest, @Query('limit') limit?: string) {
    return this.notifications.list(req.user!.tenantId, Number(limit) || 100);
  }

  @Get('stats')
  stats(@Req() req: AuthenticatedRequest) {
    return this.notifications.stats(req.user!.tenantId);
  }

  @Get('sms/status')
  smsStatus() {
    return this.smsProvider.status();
  }

  @Post('sms')
  enqueueSms(
    @Req() req: AuthenticatedRequest,
    @Body() body: { recipient?: string; message?: string; category?: SmsCategory; idempotencyKey?: string; availableAt?: string },
    @Headers('idempotency-key') headerKey?: string,
  ) {
    const category = body.category || 'TRANSACTIONAL';
    const availableAt = body.availableAt ? new Date(body.availableAt) : undefined;
    if (availableAt && Number.isNaN(availableAt.getTime())) {
      throw new Error('availableAt must be a valid ISO date');
    }
    return this.notifications.enqueueSms(req.user!.tenantId, {
      recipient: body.recipient || '',
      message: body.message || '',
      category,
      idempotencyKey: body.idempotencyKey || headerKey || '',
      availableAt,
    });
  }

  @Post('recover-stale')
  recoverStale(@Req() req: AuthenticatedRequest, @Query('maxAgeMinutes') maxAgeMinutes?: string) {
    return this.notifications.recoverStaleProcessing(req.user!.tenantId, Number(maxAgeMinutes) || 15);
  }
}
