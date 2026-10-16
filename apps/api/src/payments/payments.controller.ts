import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreatePaymentIntentDto, PaymentWebhookDto } from './payments.dto';
import { PaymentsService } from './payments.service';

type WebhookRequest = AuthenticatedRequest & { rawBody?: Buffer };

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  list(@Req() req: AuthenticatedRequest) {
    return this.payments.list(req.user!.tenantId);
  }

  @Get('methods')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  methods(@Req() req: AuthenticatedRequest) {
    return this.payments.listMethods(req.user!.tenantId);
  }

  @Post('intents')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  createIntent(@Req() req: AuthenticatedRequest, @Body() dto: CreatePaymentIntentDto) {
    return this.payments.createIntent(req.user!.tenantId, dto);
  }

  @Post('webhooks/:tenantId')
  webhook(
    @Req() req: WebhookRequest,
    @Param('tenantId') tenantId: string,
    @Headers('x-jaslyn-signature') signature: string | undefined,
    @Body() dto: PaymentWebhookDto,
  ) {
    if (!req.rawBody) throw new Error('Raw webhook body is unavailable');
    return this.payments.webhook(tenantId, dto, req.rawBody, signature);
  }
}
