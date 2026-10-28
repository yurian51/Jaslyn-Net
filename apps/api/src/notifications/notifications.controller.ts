import { BadRequestException, Body, Controller, Get, Headers, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { NotificationsService, SmsCategory } from './notifications.service';
import { SmsGatewayService, SmsProviderInput } from './sms-gateway.service';

@Controller('notifications')
@UseGuards(AuthGuard, RolesGuard)
@Roles('OWNER', 'ADMIN')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly smsGateway: SmsGatewayService,
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
  smsStatus(@Req() req: AuthenticatedRequest) {
    return this.smsGateway.status(req.user!.tenantId);
  }

  @Get('sms/settings')
  smsSettings(@Req() req: AuthenticatedRequest) {
    return this.smsGateway.getSettings(req.user!.tenantId);
  }

  @Put('sms/settings')
  saveSmsSettings(@Req() req: AuthenticatedRequest, @Body() body: SmsProviderInput) {
    return this.smsGateway.save(req.user!.tenantId, body);
  }

  @Post('sms')
  enqueueSms(
    @Req() req: AuthenticatedRequest,
    @Body() body: { recipient?: string; message?: string; category?: SmsCategory; idempotencyKey?: string; availableAt?: string },
    @Headers('idempotency-key') headerKey?: string,
  ) {
    const category = body.category || 'TRANSACTIONAL';
    const availableAt = body.availableAt ? new Date(body.availableAt) : undefined;
    if (availableAt && Number.isNaN(availableAt.getTime())) throw new BadRequestException('availableAt must be a valid ISO date');
    return this.notifications.enqueueSms(req.user!.tenantId, {
      recipient: body.recipient || '', message: body.message || '', category,
      idempotencyKey: body.idempotencyKey || headerKey || '', availableAt,
    });
  }

  @Get('sms/campaigns')
  listSmsCampaigns(@Req() req: AuthenticatedRequest, @Query('limit') limit?: string) {
    return this.notifications.listSmsCampaigns(req.user!.tenantId, Number(limit) || 50);
  }

  @Post('sms/bulk')
  enqueueBulkSms(
    @Req() req: AuthenticatedRequest,
    @Body() body: { recipients?: string[]; message?: string; category?: SmsCategory; idempotencyKey?: string; name?: string },
    @Headers('idempotency-key') headerKey?: string,
  ) {
    return this.notifications.enqueueBulkSms(req.user!.tenantId, {
      recipients: body.recipients || [], message: body.message || '',
      category: body.category || 'TRANSACTIONAL', idempotencyKey: body.idempotencyKey || headerKey || '', name: body.name,
    });
  }

  @Post('recover-stale')
  recoverStale(@Req() req: AuthenticatedRequest, @Query('maxAgeMinutes') maxAgeMinutes?: string) {
    return this.notifications.recoverStaleProcessing(req.user!.tenantId, Number(maxAgeMinutes) || 15);
  }
}
