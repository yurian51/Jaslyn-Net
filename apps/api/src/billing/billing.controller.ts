import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateWifiPurchaseDto, InitiatePaymentDto } from './billing.dto';
import { BillingService } from './billing.service';

@Controller('billing')
@UseGuards(AuthGuard, RolesGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('purchases')
  listPurchases(@Req() req: AuthenticatedRequest, @Query('customerId') customerId?: string) {
    return this.billing.listPurchases(req.user!.tenantId, customerId);
  }

  @Post('purchases')
  @Roles('OWNER', 'ADMIN', 'CASHIER', 'AGENT')
  createPurchase(@Req() req: AuthenticatedRequest, @Body() dto: CreateWifiPurchaseDto) {
    return this.billing.createPurchase(req.user!.tenantId, dto);
  }

  @Post('payments')
  @Roles('OWNER', 'ADMIN', 'CASHIER')
  initiatePayment(@Req() req: AuthenticatedRequest, @Body() dto: InitiatePaymentDto) {
    return this.billing.initiatePayment(req.user!.tenantId, dto);
  }
}
