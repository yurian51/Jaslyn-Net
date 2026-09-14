import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ConfirmPurchasePaymentDto, CreatePurchaseDto } from './purchases.dto';
import { PurchasesService } from './purchases.service';

@Controller('purchases')
@UseGuards(AuthGuard, RolesGuard)
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query('customerId') customerId?: string) {
    return this.purchases.list(req.user!.tenantId, customerId);
  }

  @Get(':id')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.purchases.get(req.user!.tenantId, id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'CASHIER', 'AGENT')
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreatePurchaseDto) {
    return this.purchases.create(req.user!.tenantId, dto);
  }

  @Post(':id/confirm-payment')
  @Roles('OWNER', 'ADMIN', 'CASHIER')
  confirmPayment(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: ConfirmPurchasePaymentDto) {
    return this.purchases.confirmPayment(req.user!.tenantId, id, dto);
  }
}
