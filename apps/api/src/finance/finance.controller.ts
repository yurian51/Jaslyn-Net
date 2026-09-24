import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateInvoiceDto, CreateLedgerAccountDto } from './finance.dto';
import { FinanceService } from './finance.service';

@Controller('finance')
@UseGuards(AuthGuard, RolesGuard)
export class FinanceController {
  constructor(private readonly finance:FinanceService){}
  @Get('invoices') @Roles('OWNER','ADMIN','CASHIER','AGENT')
  invoices(@Req() req:AuthenticatedRequest,@Query('customerId') customerId?:string){return this.finance.listInvoices(req.user!.tenantId,customerId)}
  @Post('invoices') @Roles('OWNER','ADMIN','CASHIER')
  createInvoice(@Req() req:AuthenticatedRequest,@Body() dto:CreateInvoiceDto){return this.finance.createInvoice(req.user!.tenantId,dto)}
  @Get('ledger/accounts') @Roles('OWNER','ADMIN','CASHIER')
  accounts(@Req() req:AuthenticatedRequest){return this.finance.listLedgerAccounts(req.user!.tenantId)}
  @Post('ledger/accounts') @Roles('OWNER','ADMIN')
  createAccount(@Req() req:AuthenticatedRequest,@Body() dto:CreateLedgerAccountDto){return this.finance.createLedgerAccount(req.user!.tenantId,dto)}
  @Get('ledger/accounts/:id/balance') @Roles('OWNER','ADMIN','CASHIER')
  balance(@Req() req:AuthenticatedRequest,@Query('id') id:string){return this.finance.ledgerAccountBalance(req.user!.tenantId,id)}
}
