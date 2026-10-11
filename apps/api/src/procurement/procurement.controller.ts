import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { ProcurementService } from './procurement.service';
import { CreateCustomerCreditNoteDto, CreateInventoryItemDto, CreatePurchaseOrderDto, CreatePurchaseOrderLineDto, CreateStockMovementDto, CreateSupplierDto, CreateSupplierInvoiceDto, UpdateBrandingDto } from './procurement.dto';

@Controller()
@UseGuards(AuthGuard,RolesGuard,PermissionsGuard)
export class ProcurementController {
  constructor(private readonly service:ProcurementService){}
  @Get('procurement/suppliers') @Roles('OWNER','ADMIN','CASHIER','AGENT','READ_ONLY') @Permissions('procurement.read')
  suppliers(@Req() r:AuthenticatedRequest){return this.service.listSuppliers(r.user!.tenantId);}
  @Post('procurement/suppliers') @Roles('OWNER','ADMIN') @Permissions('procurement.manage')
  createSupplier(@Req() r:AuthenticatedRequest,@Body() d:CreateSupplierDto){return this.service.createSupplier(r.user!.tenantId,r.user!.id,d);}
  @Get('procurement/purchase-orders') @Roles('OWNER','ADMIN','CASHIER','AGENT','READ_ONLY') @Permissions('procurement.read')
  purchaseOrders(@Req() r:AuthenticatedRequest){return this.service.listPurchaseOrders(r.user!.tenantId);}
  @Get('procurement/purchase-orders/:id/lines') @Roles('OWNER','ADMIN','CASHIER','AGENT','READ_ONLY') @Permissions('procurement.read')
  purchaseOrderLines(@Req() r:AuthenticatedRequest,@Param('id') id:string){return this.service.listPurchaseOrderLines(r.user!.tenantId,id);}
  @Post('procurement/purchase-orders') @Roles('OWNER','ADMIN') @Permissions('procurement.manage')
  createPurchaseOrder(@Req() r:AuthenticatedRequest,@Body() d:CreatePurchaseOrderDto){return this.service.createPurchaseOrder(r.user!.tenantId,r.user!.id,d);}
  @Post('procurement/purchase-orders/:id/lines') @Roles('OWNER','ADMIN') @Permissions('procurement.manage')
  addPurchaseOrderLine(@Req() r:AuthenticatedRequest,@Param('id') id:string,@Body() d:CreatePurchaseOrderLineDto){return this.service.addPurchaseOrderLine(r.user!.tenantId,r.user!.id,id,d);}
  @Get('procurement/supplier-invoices') @Roles('OWNER','ADMIN','CASHIER','AGENT','READ_ONLY') @Permissions('procurement.read')
  supplierInvoices(@Req() r:AuthenticatedRequest){return this.service.listSupplierInvoices(r.user!.tenantId);}
  @Post('procurement/supplier-invoices') @Roles('OWNER','ADMIN','CASHIER') @Permissions('procurement.manage')
  createSupplierInvoice(@Req() r:AuthenticatedRequest,@Body() d:CreateSupplierInvoiceDto){return this.service.createSupplierInvoice(r.user!.tenantId,r.user!.id,d);}
  @Get('inventory/items') @Roles('OWNER','ADMIN','CASHIER','AGENT','READ_ONLY') @Permissions('inventory.read')
  inventory(@Req() r:AuthenticatedRequest){return this.service.listInventory(r.user!.tenantId);}
  @Post('inventory/items') @Roles('OWNER','ADMIN') @Permissions('inventory.manage')
  createInventoryItem(@Req() r:AuthenticatedRequest,@Body() d:CreateInventoryItemDto){return this.service.createInventoryItem(r.user!.tenantId,r.user!.id,d);}
  @Get('inventory/movements') @Roles('OWNER','ADMIN','CASHIER','AGENT','READ_ONLY') @Permissions('inventory.read')
  movements(@Req() r:AuthenticatedRequest,@Query('itemId') itemId?:string){return this.service.listMovements(r.user!.tenantId,itemId);}
  @Post('inventory/items/:id/movements') @Roles('OWNER','ADMIN','CASHIER') @Permissions('inventory.manage')
  movement(@Req() r:AuthenticatedRequest,@Param('id') id:string,@Body() d:CreateStockMovementDto){return this.service.postStockMovement(r.user!.tenantId,r.user!.id,id,d);}
  @Get('finance-ops/credit-notes') @Roles('OWNER','ADMIN','CASHIER','READ_ONLY') @Permissions('revenue.read')
  creditNotes(@Req() r:AuthenticatedRequest){return this.service.listCreditNotes(r.user!.tenantId);}
  @Post('finance-ops/credit-notes') @Roles('OWNER','ADMIN','CASHIER') @Permissions('revenue.manage')
  createCreditNote(@Req() r:AuthenticatedRequest,@Body() d:CreateCustomerCreditNoteDto){return this.service.createCreditNote(r.user!.tenantId,r.user!.id,d);}
  @Post('finance-ops/credit-notes/:id/issue') @Roles('OWNER','ADMIN') @Permissions('revenue.manage')
  issueCreditNote(@Req() r:AuthenticatedRequest,@Param('id') id:string){return this.service.transitionCreditNote(r.user!.tenantId,r.user!.id,id,'ISSUED');}
  @Post('finance-ops/credit-notes/:id/apply') @Roles('OWNER','ADMIN') @Permissions('revenue.manage')
  applyCreditNote(@Req() r:AuthenticatedRequest,@Param('id') id:string){return this.service.transitionCreditNote(r.user!.tenantId,r.user!.id,id,'APPLIED');}
  @Get('finance-ops/accounts-receivable/aging') @Roles('OWNER','ADMIN','CASHIER','READ_ONLY') @Permissions('revenue.read')
  arAging(@Req() r:AuthenticatedRequest){return this.service.arAging(r.user!.tenantId);}
  @Get('finance-ops/audit/verify') @Roles('OWNER','ADMIN') @Permissions('platform.audit.read')
  verifyFinancialAudit(@Req() r:AuthenticatedRequest){return this.service.verifyFinancialAuditChain(r.user!.tenantId);}
  @Get('finance-ops/audit') @Roles('OWNER','ADMIN') @Permissions('platform.audit.read')
  financialAudit(@Req() r:AuthenticatedRequest,@Query('limit') limit?:string){return this.service.listFinancialAudit(r.user!.tenantId,Number(limit??100));}
  @Get('msp/branding') @Roles('OWNER','ADMIN') @Permissions('msp.branding.manage')
  branding(@Req() r:AuthenticatedRequest){return this.service.getBranding(r.user!.tenantId);}
  @Post('msp/branding') @Roles('OWNER','ADMIN') @Permissions('msp.branding.manage')
  updateBranding(@Req() r:AuthenticatedRequest,@Body() d:UpdateBrandingDto){return this.service.updateBranding(r.user!.tenantId,r.user!.id,d);}
}
