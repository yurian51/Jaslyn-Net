import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { ApiKeyGuard, ApiKeyRequest, ApiKeyScopes } from './api-key.guard';

@Controller('public/v1')
@UseGuards(ApiKeyGuard)
export class PublicApiController {
  constructor(@Inject(PG_POOL) private readonly db:Pool){}
  private limit(raw?:string){const n=Number(raw??100);return Number.isFinite(n)?Math.max(1,Math.min(500,Math.trunc(n))):100;}
  @Get('invoices') @ApiKeyScopes('finance.read')
  async invoices(@Req() req:ApiKeyRequest,@Query('limit') limit?:string){
    const r=await this.db.query(`SELECT id,invoice_number,status,currency,subtotal,tax_total,total,amount_paid,due_at,issued_at,created_at
      FROM invoices WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT $2`,[req.apiKey!.tenantId,this.limit(limit)]);
    return {data:r.rows,count:r.rowCount??0};
  }
  @Get('payments') @ApiKeyScopes('finance.read')
  async payments(@Req() req:ApiKeyRequest,@Query('limit') limit?:string){
    const r=await this.db.query(`SELECT id,customer_id,purchase_id,provider,provider_reference,amount,currency,status,created_at,updated_at
      FROM payments WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT $2`,[req.apiKey!.tenantId,this.limit(limit)]);
    return {data:r.rows,count:r.rowCount??0};
  }
  @Get('inventory') @ApiKeyScopes('inventory.read')
  async inventory(@Req() req:ApiKeyRequest,@Query('limit') limit?:string){
    const r=await this.db.query(`SELECT id,sku,name,unit,quantity_on_hand,average_unit_cost,
      (quantity_on_hand*average_unit_cost)::numeric(20,2) AS stock_value,updated_at
      FROM inventory_items WHERE tenant_id=$1 AND active=true ORDER BY name LIMIT $2`,[req.apiKey!.tenantId,this.limit(limit)]);
    return {data:r.rows,count:r.rowCount??0};
  }
  @Get('purchase-orders') @ApiKeyScopes('procurement.read')
  async purchaseOrders(@Req() req:ApiKeyRequest,@Query('limit') limit?:string){
    const r=await this.db.query(`SELECT id,po_number,supplier_id,status,currency,subtotal,tax_total,total,ordered_at,expected_at,created_at
      FROM purchase_orders WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT $2`,[req.apiKey!.tenantId,this.limit(limit)]);
    return {data:r.rows,count:r.rowCount??0};
  }
}
