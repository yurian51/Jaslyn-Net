import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RecordSupplierInvoicePaymentDto } from './procurement.dto';
import { ProcurementWorkflowService } from './procurement-workflow.service';

@Controller()
@UseGuards(AuthGuard,RolesGuard,PermissionsGuard)
export class ProcurementWorkflowController {
  constructor(private readonly workflow:ProcurementWorkflowService){}
  @Post('procurement/supplier-invoices/:id/payments') @Roles('OWNER','ADMIN','CASHIER') @Permissions('procurement.manage')
  paySupplierInvoice(@Req() r:AuthenticatedRequest,@Param('id') id:string,@Body() d:RecordSupplierInvoicePaymentDto){return this.workflow.recordSupplierInvoicePayment(r.user!.tenantId,r.user!.id,id,d);}
  @Get('procurement/supplier-invoice-payments') @Roles('OWNER','ADMIN','CASHIER','READ_ONLY') @Permissions('procurement.read')
  supplierInvoicePayments(@Req() r:AuthenticatedRequest,@Query('invoiceId') id?:string){return this.workflow.listSupplierInvoicePayments(r.user!.tenantId,id);}
  @Get('finance-ops/accounts-payable/aging') @Roles('OWNER','ADMIN','CASHIER','READ_ONLY') @Permissions('procurement.read')
  apAging(@Req() r:AuthenticatedRequest){return this.workflow.apAging(r.user!.tenantId);}
  @Post('procurement/purchase-orders/:id/request-approval') @Roles('OWNER','ADMIN') @Permissions('procurement.manage')
  requestApproval(@Req() r:AuthenticatedRequest,@Param('id') id:string){return this.workflow.requestPurchaseOrderApproval(r.user!.tenantId,r.user!.id,id);}
  @Post('procurement/purchase-orders/:id/approve') @Roles('OWNER','ADMIN') @Permissions('procurement.manage')
  approve(@Req() r:AuthenticatedRequest,@Param('id') id:string){return this.workflow.approvePurchaseOrder(r.user!.tenantId,r.user!.id,id);}
}
