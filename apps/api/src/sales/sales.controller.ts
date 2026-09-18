import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { SalesPeriodDto, SalesSearchDto } from './sales.dto';
import { SalesService } from './sales.service';

@Controller('sales')
@UseGuards(AuthGuard)
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get('summary')
  summary(@Req() req: AuthenticatedRequest, @Query() query: SalesPeriodDto) {
    return this.sales.summary(req.user!.tenantId, query);
  }

  @Get('customers')
  customers(@Req() req: AuthenticatedRequest, @Query() query: SalesPeriodDto) {
    return this.sales.customers(req.user!.tenantId, query);
  }

  @Get('payments/search')
  searchPayments(@Req() req: AuthenticatedRequest, @Query() query: SalesSearchDto) {
    return this.sales.searchPayments(req.user!.tenantId, query.q);
  }
}
