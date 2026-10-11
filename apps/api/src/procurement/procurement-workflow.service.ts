import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { ReceivePurchaseOrderLineDto, RecordSupplierInvoicePaymentDto } from './procurement.dto';

@Injectable()
export class ProcurementWorkflowService {
  constructor(@Inject(PG_POOL) private readonly db:Pool,private readonly audit:AuditService){}
  async recordSupplierInvoicePayment(tenantId:string,actorId:string,invoiceId:string,d:RecordSupplierInvoicePaymentDto){
    if(!Number.isFinite(d.amount)||d.amount<=0)throw new BadRequestException('Payment amount must be greater than zero');
    const client=await this.db.connect();
    try{
      await client.query('BEGIN');
      const prior=await client.query('SELECT * FROM supplier_invoice_payments WHERE tenant_id=$1 AND idempotency_key=$2 FOR UPDATE',[tenantId,d.idempotencyKey.trim()]);
      if(prior.rowCount){const p=prior.rows[0];if(p.supplier_invoice_id!==invoiceId||Number(p.amount)!==Number(d.amount)||p.currency!==d.currency)throw new ConflictException('Idempotency key is already bound to a different supplier payment');await client.query('COMMIT');return {duplicate:true,data:p};}
      const invoice=await client.query('SELECT id,total,amount_paid,currency,status FROM supplier_invoices WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,invoiceId]);
      if(!invoice.rowCount)throw new NotFoundException('Supplier invoice not found in this tenant');
      const i=invoice.rows[0];if(i.status==='VOID'||i.status==='DISPUTED')throw new ConflictException('Cannot settle a void or disputed supplier invoice');
      if(i.currency!==d.currency)throw new BadRequestException('Payment currency must match supplier invoice currency');
      if(Number(d.amount)>Number(i.total)-Number(i.amount_paid))throw new ConflictException('Payment exceeds supplier invoice outstanding balance');
      const payment=await client.query(`INSERT INTO supplier_invoice_payments(tenant_id,supplier_invoice_id,idempotency_key,amount,currency,payment_reference,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[tenantId,invoiceId,d.idempotencyKey.trim(),d.amount,d.currency,d.paymentReference?.trim()||null,actorId]);
      const paid=Number(i.amount_paid)+Number(d.amount);
      await client.query(`UPDATE supplier_invoices SET amount_paid=$3,status=CASE WHEN $3>=total THEN 'PAID' ELSE 'PARTIALLY_PAID' END,updated_at=now() WHERE tenant_id=$1 AND id=$2`,[tenantId,invoiceId,paid]);
      await client.query(`INSERT INTO webhook_delivery_outbox(tenant_id,endpoint_id,event_id,event_type,payload)
        SELECT e.tenant_id,e.id,$2::uuid,'supplier_invoice.payment_recorded',jsonb_build_object('supplierInvoiceId',$3,'paymentId',$2,'amount',$4,'currency',$5,'amountPaid',$6)
        FROM tenant_webhook_endpoints e WHERE e.tenant_id=$1 AND e.enabled=true AND 'supplier_invoice.payment_recorded'=ANY(e.event_types)
        ON CONFLICT(tenant_id,endpoint_id,event_id) DO NOTHING`,[tenantId,payment.rows[0].id,invoiceId,d.amount,d.currency,paid]);
      await client.query('COMMIT');
      await this.audit.record(tenantId,'RECORD_PAYMENT','supplier_invoice',invoiceId,{paymentId:payment.rows[0].id,amount:d.amount,currency:d.currency,idempotencyKey:d.idempotencyKey},{userId:actorId});
      return {duplicate:false,data:payment.rows[0],amountPaid:paid,outstanding:Math.max(0,Number(i.total)-paid)};
    }catch(e:unknown){await client.query('ROLLBACK').catch(()=>undefined);if(typeof e==='object'&&e!==null&&'code'in e&&(e as {code?:string}).code==='23505')throw new ConflictException('Supplier payment idempotency key already exists');throw e;}finally{client.release();}
  }
  async listSupplierInvoicePayments(tenantId:string,invoiceId?:string){
    const r=await this.db.query(`SELECT p.*,i.invoice_number FROM supplier_invoice_payments p JOIN supplier_invoices i ON i.tenant_id=p.tenant_id AND i.id=p.supplier_invoice_id
      WHERE p.tenant_id=$1 AND ($2::uuid IS NULL OR p.supplier_invoice_id=$2) ORDER BY p.created_at DESC LIMIT 1000`,[tenantId,invoiceId??null]);return {data:r.rows};
  }
  async apAging(tenantId:string){
    const r=await this.db.query(`SELECT bucket,currency,count(*)::int AS invoice_count,sum(outstanding)::numeric(20,2) AS outstanding
      FROM (SELECT currency,GREATEST(total-amount_paid,0)::numeric(20,2) AS outstanding,
        CASE WHEN due_date IS NULL OR due_date>=CURRENT_DATE THEN 'CURRENT'
          WHEN due_date>=CURRENT_DATE-30 THEN '1-30 DAYS' WHEN due_date>=CURRENT_DATE-60 THEN '31-60 DAYS'
          WHEN due_date>=CURRENT_DATE-90 THEN '61-90 DAYS' ELSE '90+ DAYS' END AS bucket
        FROM supplier_invoices WHERE tenant_id=$1 AND status NOT IN ('PAID','VOID') AND total>amount_paid) aged
      GROUP BY bucket,currency ORDER BY currency,CASE bucket WHEN 'CURRENT' THEN 0 WHEN '1-30 DAYS' THEN 1 WHEN '31-60 DAYS' THEN 2 WHEN '61-90 DAYS' THEN 3 ELSE 4 END`,[tenantId]);return {data:r.rows};
  }

  async receivePurchaseOrderLine(tenantId:string,actorId:string,orderId:string,d:ReceivePurchaseOrderLineDto){
    const quantity=Number(d.quantityReceived);if(!Number.isFinite(quantity)||quantity<=0)throw new BadRequestException('Received quantity must be positive');
    const client=await this.db.connect();
    try{
      await client.query('BEGIN');
      const prior=await client.query('SELECT * FROM inventory_stock_movements WHERE tenant_id=$1 AND idempotency_key=$2 FOR UPDATE',[tenantId,d.idempotencyKey.trim()]);
      if(prior.rowCount){const p=prior.rows[0];if(p.reference_id!==orderId||Number(p.quantity_delta)!==quantity||p.movement_type!=='RECEIPT')throw new ConflictException('Idempotency key is bound to another inventory movement');await client.query('COMMIT');return {duplicate:true,data:p};}
      const order=await client.query("SELECT id,status,currency FROM purchase_orders WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[tenantId,orderId]);
      if(!order.rowCount)throw new NotFoundException('Purchase order not found');
      if(!['APPROVED','PARTIALLY_RECEIVED'].includes(order.rows[0].status))throw new ConflictException('Only approved purchase orders can be received');
      const line=await client.query('SELECT id,item_code,quantity_ordered,quantity_received,unit_cost FROM purchase_order_lines WHERE tenant_id=$1 AND purchase_order_id=$2 AND id=$3 FOR UPDATE',[tenantId,orderId,d.lineId]);
      if(!line.rowCount)throw new NotFoundException('Purchase order line not found');
      const l=line.rows[0];if(quantity>Number(l.quantity_ordered)-Number(l.quantity_received))throw new ConflictException('Received quantity exceeds the outstanding purchase order quantity');
      const item=await client.query('SELECT id,quantity_on_hand,average_unit_cost FROM inventory_items WHERE tenant_id=$1 AND sku=$2 AND active=true FOR UPDATE',[tenantId,String(l.item_code).trim().toUpperCase()]);
      if(!item.rowCount)throw new NotFoundException('Create an active inventory item whose SKU matches the purchase order line item code before receiving stock');
      const before=Number(item.rows[0].quantity_on_hand),after=before+quantity,cost=Number(l.unit_cost);
      const avg=after===0?cost:((before*Number(item.rows[0].average_unit_cost))+(quantity*cost))/after;
      const movement=await client.query(`INSERT INTO inventory_stock_movements(tenant_id,item_id,movement_type,quantity_delta,unit_cost,currency,reference_type,reference_id,idempotency_key,notes,created_by)
        VALUES($1,$2,'RECEIPT',$3,$4,$5,'PURCHASE_ORDER',$6,$7,$8,$9) RETURNING *`,
        [tenantId,item.rows[0].id,quantity,cost,order.rows[0].currency,orderId,d.idempotencyKey.trim(),'PO line '+d.lineId,actorId]);
      await client.query('UPDATE inventory_items SET quantity_on_hand=$3,average_unit_cost=$4,updated_at=now() WHERE tenant_id=$1 AND id=$2',[tenantId,item.rows[0].id,after,avg]);
      await client.query('UPDATE purchase_order_lines SET quantity_received=quantity_received+$4 WHERE tenant_id=$1 AND purchase_order_id=$2 AND id=$3',[tenantId,orderId,d.lineId,quantity]);
      const remaining=await client.query('SELECT count(*)::int AS count FROM purchase_order_lines WHERE tenant_id=$1 AND purchase_order_id=$2 AND quantity_received<quantity_ordered',[tenantId,orderId]);
      const status=Number(remaining.rows[0].count)===0?'RECEIVED':'PARTIALLY_RECEIVED';
      await client.query('UPDATE purchase_orders SET status=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2',[tenantId,orderId,status]);
      await client.query('COMMIT');
      await this.audit.record(tenantId,'RECEIVE_STOCK','purchase_order',orderId,{lineId:d.lineId,quantity,inventoryItemId:item.rows[0].id,movementId:movement.rows[0].id,quantityOnHand:after},{userId:actorId});
      await this.db.query(`INSERT INTO webhook_delivery_outbox(tenant_id,endpoint_id,event_id,event_type,payload)
        SELECT e.tenant_id,e.id,$2::uuid,'inventory.movement',jsonb_build_object('movementId',$2,'purchaseOrderId',$3,'itemId',$4,'quantity',$5,'quantityOnHand',$6)
        FROM tenant_webhook_endpoints e WHERE e.tenant_id=$1 AND e.enabled=true AND 'inventory.movement'=ANY(e.event_types)
        ON CONFLICT(tenant_id,endpoint_id,event_id) DO NOTHING`,[tenantId,movement.rows[0].id,orderId,item.rows[0].id,quantity,after]);
      return {duplicate:false,data:movement.rows[0],quantityOnHand:after,averageUnitCost:avg,purchaseOrderStatus:status};
    }catch(e:unknown){await client.query('ROLLBACK').catch(()=>undefined);throw e;}finally{client.release();}
  }

  async requestPurchaseOrderApproval(tenantId:string,actorId:string,id:string){
    const r=await this.db.query(`UPDATE purchase_orders SET status='PENDING_APPROVAL',updated_at=now() WHERE tenant_id=$1 AND id=$2 AND status='DRAFT' RETURNING id,po_number,status`,[tenantId,id]);
    if(!r.rowCount)throw new ConflictException('Only draft purchase orders can be submitted for approval');
    await this.audit.record(tenantId,'REQUEST_APPROVAL','purchase_order',id,{poNumber:r.rows[0].po_number},{userId:actorId});return r.rows[0];
  }
  async approvePurchaseOrder(tenantId:string,actorId:string,id:string){
    const r=await this.db.query(`UPDATE purchase_orders SET status='APPROVED',approved_by=$3,ordered_at=COALESCE(ordered_at,now()),updated_at=now()
      WHERE tenant_id=$1 AND id=$2 AND status='PENDING_APPROVAL' RETURNING id,po_number,status,total,currency`,[tenantId,id,actorId]);
    if(!r.rowCount)throw new ConflictException('Purchase order must be pending approval');
    await this.audit.record(tenantId,'APPROVE','purchase_order',id,{poNumber:r.rows[0].po_number,total:r.rows[0].total,currency:r.rows[0].currency},{userId:actorId});return r.rows[0];
  }
}
