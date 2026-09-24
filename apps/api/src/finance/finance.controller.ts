import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateAdjustmentDto, CreateCommissionDto, CreateDisputeDto, CreateInvoiceDto, CreateInvoiceLineDto, CreateLedgerAccountDto, CreateRefundDto, CreateResellerDto, ReconcileDto, TaxRateDto } from './finance.dto';
import { FinanceService } from './finance.service';

@Controller('finance') @UseGuards(AuthGuard, RolesGuard)
export class FinanceController {
 constructor(private readonly finance:FinanceService){}
 @Get('invoices') @Roles('OWNER','ADMIN','CASHIER','AGENT') invoices(@Req() r:AuthenticatedRequest,@Query('customerId') c?:string){return this.finance.listInvoices(r.user!.tenantId,c)}
 @Get('invoices/:id') @Roles('OWNER','ADMIN','CASHIER','AGENT') invoice(@Req() r:AuthenticatedRequest,@Param('id') id:string){return this.finance.getInvoice(r.user!.tenantId,id)}
 @Post('invoices/:id/lines') @Roles('OWNER','ADMIN','CASHIER') addInvoiceLine(@Req() r:AuthenticatedRequest,@Param('id') id:string,@Body() d:CreateInvoiceLineDto){return this.finance.addInvoiceLine(r.user!.tenantId,id,d)}
 @Post('invoices') @Roles('OWNER','ADMIN','CASHIER') createInvoice(@Req() r:AuthenticatedRequest,@Body() d:CreateInvoiceDto){return this.finance.createInvoice(r.user!.tenantId,d)}
 @Get('ledger/accounts') @Roles('OWNER','ADMIN','CASHIER') accounts(@Req() r:AuthenticatedRequest){return this.finance.listLedgerAccounts(r.user!.tenantId)}
 @Post('ledger/accounts') @Roles('OWNER','ADMIN') createAccount(@Req() r:AuthenticatedRequest,@Body() d:CreateLedgerAccountDto){return this.finance.createLedgerAccount(r.user!.tenantId,d)}
 @Get('ledger/accounts/:id/balance') @Roles('OWNER','ADMIN','CASHIER') balance(@Req() r:AuthenticatedRequest,@Param('id') id:string){return this.finance.ledgerAccountBalance(r.user!.tenantId,id)}
 @Get('resellers') @Roles('OWNER','ADMIN','CASHIER','AGENT') resellers(@Req() r:AuthenticatedRequest){return this.finance.listResellers(r.user!.tenantId)}
 @Post('resellers') @Roles('OWNER','ADMIN') createReseller(@Req() r:AuthenticatedRequest,@Body() d:CreateResellerDto){return this.finance.createReseller(r.user!.tenantId,d)}
 @Patch('resellers/:id/status') @Roles('OWNER','ADMIN') resellerStatus(@Req() r:AuthenticatedRequest,@Param('id') id:string,@Body('status') s:string){return this.finance.updateResellerStatus(r.user!.tenantId,id,s)}
 @Get('commissions') @Roles('OWNER','ADMIN','CASHIER','AGENT') commissions(@Req() r:AuthenticatedRequest,@Query('resellerId') id?:string){return this.finance.listCommissions(r.user!.tenantId,id)}
 @Post('commissions/accrue') @Roles('OWNER','ADMIN','CASHIER') accrue(@Req() r:AuthenticatedRequest,@Body() d:CreateCommissionDto){return this.finance.accrueCommission(r.user!.tenantId,d)}
 @Patch('commissions/:id/approve') @Roles('OWNER','ADMIN') approveCommission(@Req() r:AuthenticatedRequest,@Param('id') id:string){return this.finance.approveCommission(r.user!.tenantId,id)}
 @Patch('commissions/:id/paid') @Roles('OWNER','ADMIN') paidCommission(@Req() r:AuthenticatedRequest,@Param('id') id:string){return this.finance.markCommissionPaid(r.user!.tenantId,id)}
 @Get('refunds') @Roles('OWNER','ADMIN','CASHIER') refunds(@Req() r:AuthenticatedRequest){return this.finance.listRefunds(r.user!.tenantId)}
 @Post('refunds') @Roles('OWNER','ADMIN','CASHIER') refund(@Req() r:AuthenticatedRequest,@Body() d:CreateRefundDto){return this.finance.requestRefund(r.user!.tenantId,d)}
 @Patch('refunds/:id/approve') @Roles('OWNER','ADMIN') approveRefund(@Req() r:AuthenticatedRequest,@Param('id') id:string){return this.finance.approveRefund(r.user!.tenantId,id,r.user!.id)}
 @Get('adjustments') @Roles('OWNER','ADMIN','CASHIER') adjustments(@Req() r:AuthenticatedRequest){return this.finance.listAdjustments(r.user!.tenantId)}
 @Post('adjustments') @Roles('OWNER','ADMIN','CASHIER') adjustment(@Req() r:AuthenticatedRequest,@Body() d:CreateAdjustmentDto){return this.finance.createAdjustment(r.user!.tenantId,d,r.user!.id)}
 @Patch('adjustments/:id/approve') @Roles('OWNER','ADMIN') approveAdjustment(@Req() r:AuthenticatedRequest,@Param('id') id:string){return this.finance.approveAdjustment(r.user!.tenantId,id,r.user!.id)}
 @Get('disputes') @Roles('OWNER','ADMIN','CASHIER') disputes(@Req() r:AuthenticatedRequest){return this.finance.listDisputes(r.user!.tenantId)}
 @Post('disputes') @Roles('OWNER','ADMIN','CASHIER') dispute(@Req() r:AuthenticatedRequest,@Body() d:CreateDisputeDto){return this.finance.createDispute(r.user!.tenantId,d)}
 @Patch('disputes/:id/resolve') @Roles('OWNER','ADMIN') resolveDispute(@Req() r:AuthenticatedRequest,@Param('id') id:string,@Body('status') s:string,@Body('resolution') x?:string){return this.finance.resolveDispute(r.user!.tenantId,id,s,x)}
 @Get('tax-rates') @Roles('OWNER','ADMIN','CASHIER') taxRates(@Req() r:AuthenticatedRequest){return this.finance.listTaxRates(r.user!.tenantId)}
 @Post('tax-rates') @Roles('OWNER','ADMIN') taxRate(@Req() r:AuthenticatedRequest,@Body() d:TaxRateDto){return this.finance.createTaxRate(r.user!.tenantId,d)}
 @Get('reconciliation') @Roles('OWNER','ADMIN','CASHIER') reconciliation(@Req() r:AuthenticatedRequest){return this.finance.listReconciliations(r.user!.tenantId)}
 @Get('reconciliation/:id') @Roles('OWNER','ADMIN','CASHIER') reconciliationOne(@Req() r:AuthenticatedRequest,@Param('id') id:string){return this.finance.getReconciliation(r.user!.tenantId,id)}
 @Post('reconciliation/run') @Roles('OWNER','ADMIN') reconcile(@Req() r:AuthenticatedRequest,@Body() d:ReconcileDto){return this.finance.reconcile(r.user!.tenantId,d)}
}