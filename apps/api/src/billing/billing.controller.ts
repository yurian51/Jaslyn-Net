import { Body, Controller, Get, Headers, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateWifiPurchaseDto, InitiatePaymentDto, PaymentWebhookDto } from './billing.dto';
import { BillingService } from './billing.service';
import { PurchasesService } from '../purchases/purchases.service';

type WebhookRequest = { rawBody?: Buffer; params: { provider: string } };

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly purchases: PurchasesService,
  ) {}

  @Get('purchases')
  @UseGuards(AuthGuard, RolesGuard)
  listPurchases(@Req() req: AuthenticatedRequest, @Query('customerId') customerId?: string) {
    return this.purchases.list(req.user!.tenantId, customerId);
  }

  @Post('purchases')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN', 'CASHIER', 'AGENT')
  createPurchase(@Req() req: AuthenticatedRequest, @Body() dto: CreateWifiPurchaseDto) {
    return this.purchases.create(req.user!.tenantId, dto);
  }

  @Post('payments')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN', 'CASHIER')
  initiatePayment(@Req() req: AuthenticatedRequest, @Body() dto: InitiatePaymentDto) {
    return this.billing.initiatePayment(req.user!.tenantId, dto);
  }

  @Post('webhooks/:provider')
  async paymentWebhook(
    @Req() req: WebhookRequest,
    @Headers('x-nexora-signature') signature: string | undefined,
    @Headers('x-payment-signature') providerSignature: string | undefined,
    @Body() dto: PaymentWebhookDto,
  ) {
    if (!req.rawBody) throw new UnauthorizedException('Raw webhook body is unavailable');
    this.billing.verifyWebhookSignature(req.rawBody, signature ?? providerSignature);
    return this.billing.processPaymentWebhook(req.params.provider, dto);
  }
}
