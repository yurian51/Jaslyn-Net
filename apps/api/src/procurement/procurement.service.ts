import { ConflictException, Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { CreateCustomerCreditNoteDto, CreateInventoryItemDto, CreatePurchaseOrderDto, CreatePurchaseOrderLineDto, CreateStockMovementDto, CreateSupplierDto, CreateSupplierInvoiceDto, UpdateBrandingDto } from './procurement.dto';

@Injectable()
export class ProcurementService {
  constructor(@Inject(PG_POOL) private readonly db: Pool, private readonly audit: AuditService) {}

  private async auditChange(tenantId:string, actorId:string, action:string, type:string, id:string, metadata:Record<string,unknown>={}) {
    await this.audit.record(tenantId,action,type,id,metadata,{userId:actorId});
  }

  async listSuppliers(tenantId:string) {
    const r=await this.db.query('SELECT * FROM suppliers WHERE tenant_id=$1 ORDER BY name LIMIT 500',[tenantId]);
    return {data:r.rows};
  }
  async createSupplier(tenantId:string,actorId:string,d:CreateSupplierDto) {
    try {
      const r=await this.db.query(`INSERT INTO suppliers(tenant_id,supplier_code,name,tax_number,email,phone)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [tenantId,d.supplierCode.trim().toUpperCase(),d.name.trim(),d.taxNumber?.trim()||null,d.email?.trim().toLowerCase()||null,d.phone?.trim()||null]);
      await this.auditChange(tenantId,actorId,'CREATE','supplier',r.rows[0].id,{supplierCode:r.rows[0].supplier_code});
      return r.rows[0];
    } catch(e:unknown) {
      if(typeof e==='object'&&e!==null&&'code' in e&&(e as {code?:string}).code==='23505') throw new ConflictException('Supplier code already exists in this tenant');
      throw e;
    }
  }
  async listPurchaseOrders(tenantId:string) {
    const r=await this.db.query(`SELECT p.*,s.name AS supplier_name FROM purchase_orders p JOIN suppliers s ON s.tenant_id=p.tenant_id AND s.id=p.supplier_id WHERE p.tenant_id=$1 ORDER BY p.created_at DESC LIMIT 500`,[tenantId]);
    return {data:r.rows};
  }
  async createPurchaseOrder(tenantId:string,actorId:string,d:CreatePurchaseOrderDto) {
    const client=await this.db.connect();
    try {
      await client.query('BEGIN');
      const supplier=await client.query("SELECT id FROM suppliers WHERE tenant_id=$1 AND id=$2 AND status='ACTIVE' FOR SHARE",[tenantId,d.supplierId]);
      if(!supplier.rowCount) throw new NotFoundException('Active supplier not found in this tenant');
      const r=await client.query(`INSERT INTO purchase_orders(tenant_id,supplier_id,po_number,currency,expected_at,created_by)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[tenantId,d.supplierId,d.poNumber.trim(),d.currency,d.expectedAt??null,actorId]);
      await client.query('COMMIT');
      await this.auditChange(tenantId,actorId,'CREATE','purchase_order',r.rows[0].id,{poNumber:r.rows[0].po_number});
      return r.rows[0];
    } catch(e:unknown) {
      await client.query('ROLLBACK');
      if(typeof e==='object'&&e!==null&&'code' in e&&(e as {code?:string}).code==='23505') throw new ConflictException('Purchase order number already exists in this tenant');
      throw e;
    } finally { client.release(); }
  }
  async addPurchaseOrderLine(tenantId:string,actorId:string,orderId:string,d:CreatePurchaseOrderLineDto) {
    const client=await this.db.connect();
    try {
      await client.query('BEGIN');
      const order=await client.query("SELECT id,status FROM purchase_orders WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[tenantId,orderId]);
      if(!order.rowCount) throw new NotFoundException('Purchase order not found');
      if(!['DRAFT','PENDING_APPROVAL'].includes(order.rows[0].status)) throw new ConflictException('Purchase order lines are locked after approval or receipt');
      const q=Number(d.quantityOrdered), cost=Number(d.unitCost), taxRate=Number(d.taxRate??0);
      if(!Number.isFinite(q)||q<=0||!Number.isFinite(cost)||cost<0||!Number.isFinite(taxRate)||taxRate<0||taxRate>100) throw new BadRequestException('Invalid quantity, cost or tax rate');
      const line=await client.query(`INSERT INTO purchase_order_lines(tenant_id,purchase_order_id,item_code,description,quantity_ordered,unit_cost,tax_rate)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[tenantId,orderId,d.itemCode.trim(),d.description.trim(),q,cost,taxRate]);
      await client.query(`UPDATE purchase_orders SET
        subtotal=(SELECT COALESCE(SUM(quantity_ordered*unit_cost),0) FROM purchase_order_lines WHERE tenant_id=$1 AND purchase_order_id=$2),
        tax_total=(SELECT COALESCE(SUM(quantity_ordered*unit_cost*tax_rate/100),0) FROM purchase_order_lines WHERE tenant_id=$1 AND purchase_order_id=$2),
        total=(SELECT COALESCE(SUM(quantity_ordered*unit_cost*(1+tax_rate/100)),0) FROM purchase_order_lines WHERE tenant_id=$1 AND purchase_order_id=$2),
        updated_at=now() WHERE tenant_id=$1 AND id=$2`,[tenantId,orderId]);
      await client.query('COMMIT');
      await this.auditChange(tenantId,actorId,'ADD_LINE','purchase_order',orderId,{lineId:line.rows[0].id});
      return line.rows[0];
    } catch(e:unknown) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }
  async listSupplierInvoices(tenantId:string) {
    const r=await this.db.query(`SELECT i.*,s.name AS supplier_name,p.po_number FROM supplier_invoices i
      JOIN suppliers s ON s.tenant_id=i.tenant_id AND s.id=i.supplier_id
      LEFT JOIN purchase_orders p ON p.tenant_id=i.tenant_id AND p.id=i.purchase_order_id
      WHERE i.tenant_id=$1 ORDER BY i.invoice_date DESC LIMIT 500`,[tenantId]);
    return {data:r.rows};
  }
  async createSupplierInvoice(tenantId:string,actorId:string,d:CreateSupplierInvoiceDto) {
    if(d.purchaseOrderId) {
      const po=await this.db.query("SELECT id,supplier_id,currency,total,status FROM purchase_orders WHERE tenant_id=$1 AND id=$2",[tenantId,d.purchaseOrderId]);
      if(!po.rowCount) throw new NotFoundException('Purchase order not found');
      if(po.rows[0].supplier_id!==d.supplierId) throw new BadRequestException('Supplier invoice and purchase order suppliers do not match');
      if(po.rows[0].currency!==d.currency) throw new BadRequestException('Supplier invoice and purchase order currencies do not match');
      if(Number(d.subtotal)+Number(d.taxTotal??0)>Number(po.rows[0].total)&&Number(po.rows[0].total)>0) throw new ConflictException('Supplier invoice exceeds purchase order total');
    }
    try {
      const r=await this.db.query(`INSERT INTO supplier_invoices(tenant_id,supplier_id,purchase_order_id,invoice_number,currency,subtotal,tax_total,total,status,invoice_date,due_date,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'RECEIVED',$9::date,$10::date,$11) RETURNING *`,
        [tenantId,d.supplierId,d.purchaseOrderId??null,d.invoiceNumber.trim(),d.currency,Number(d.subtotal),Number(d.taxTotal??0),Number(d.subtotal)+Number(d.taxTotal??0),d.invoiceDate,d.dueDate??null,actorId]);
      await this.auditChange(tenantId,actorId,'CREATE','supplier_invoice',r.rows[0].id,{invoiceNumber:r.rows[0].invoice_number,total:r.rows[0].total,currency:r.rows[0].currency});
      return r.rows[0];
    } catch(e:unknown) {
      if(typeof e==='object'&&e!==null&&'code' in e&&(e as {code?:string}).code==='23505') throw new ConflictException('Supplier invoice number already exists for this supplier');
      throw e;
    }
  }
  async listInventory(tenantId:string) {
    const r=await this.db.query(`SELECT i.*,(i.quantity_on_hand*i.average_unit_cost)::numeric(20,2) AS stock_value,
      (i.quantity_on_hand<=i.reorder_level) AS reorder_required
      FROM inventory_items i WHERE i.tenant_id=$1 AND i.active=true ORDER BY i.name LIMIT 1000`,[tenantId]);
    return {data:r.rows};
  }
  async createInventoryItem(tenantId:string,actorId:string,d:CreateInventoryItemDto) {
    try {
      const r=await this.db.query(`INSERT INTO inventory_items(tenant_id,sku,name,description,unit,valuation_method,reorder_level)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[tenantId,d.sku.trim().toUpperCase(),d.name.trim(),d.description?.trim()||null,d.unit?.trim()||'each',d.valuationMethod??'WEIGHTED_AVERAGE',Number(d.reorderLevel??0)]);
      await this.auditChange(tenantId,actorId,'CREATE','inventory_item',r.rows[0].id,{sku:r.rows[0].sku});
      return r.rows[0];
    } catch(e:unknown) {
      if(typeof e==='object'&&e!==null&&'code' in e&&(e as {code?:string}).code==='23505') throw new ConflictException('SKU already exists in this tenant');
      throw e;
    }
  }
  async listMovements(tenantId:string,itemId?:string) {
    const r=await this.db.query(`SELECT m.*,i.sku,i.name AS item_name FROM inventory_stock_movements m
      JOIN inventory_items i ON i.tenant_id=m.tenant_id AND i.id=m.item_id
      WHERE m.tenant_id=$1 AND ($2::uuid IS NULL OR m.item_id=$2) ORDER BY m.created_at DESC LIMIT 1000`,[tenantId,itemId??null]);
    return {data:r.rows};
  }
  async postStockMovement(tenantId:string,actorId:string,itemId:string,d:CreateStockMovementDto) {
    const delta=Number(d.quantityDelta), cost=Number(d.unitCost);
    if(!Number.isFinite(delta)||delta===0||!Number.isFinite(cost)||cost<0) throw new BadRequestException('Quantity must be non-zero and unit cost must be non-negative');
    if(['RECEIPT','RETURN'].includes(d.movementType)&&delta<0) throw new BadRequestException('Receipt and return movements must increase stock');
    if(d.movementType==='ISSUE'&&delta>0) throw new BadRequestException('Issue movements must decrease stock');
    const client=await this.db.connect();
    try {
      await client.query('BEGIN');
      const prior=await client.query('SELECT * FROM inventory_stock_movements WHERE tenant_id=$1 AND idempotency_key=$2 FOR UPDATE',[tenantId,d.idempotencyKey.trim()]);
      if(prior.rowCount) {
        const old=prior.rows[0];
        if(old.item_id!==itemId||Number(old.quantity_delta)!==delta||old.movement_type!==d.movementType) throw new ConflictException('Idempotency key was already used for a different stock movement');
        await client.query('COMMIT');
        return {duplicate:true,data:old};
      }
      const item=await client.query('SELECT * FROM inventory_items WHERE tenant_id=$1 AND id=$2 AND active=true FOR UPDATE',[tenantId,itemId]);
      if(!item.rowCount) throw new NotFoundException('Inventory item not found');
      const before=Number(item.rows[0].quantity_on_hand), after=before+delta;
      if(after<0) throw new ConflictException('Stock movement would make inventory negative');
      let avg=Number(item.rows[0].average_unit_cost);
      if(delta>0&&d.movementType!=='ADJUSTMENT') avg=after===0?cost:((before*avg)+(delta*cost))/after;
      const movement=await client.query(`INSERT INTO inventory_stock_movements(tenant_id,item_id,movement_type,quantity_delta,unit_cost,currency,reference_type,reference_id,idempotency_key,notes,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [tenantId,itemId,d.movementType,delta,cost,d.currency,d.referenceType.trim(),d.referenceId??null,d.idempotencyKey.trim(),d.notes?.trim()||null,actorId]);
      await client.query('UPDATE inventory_items SET quantity_on_hand=$3,average_unit_cost=$4,updated_at=now() WHERE tenant_id=$1 AND id=$2',[tenantId,itemId,after,avg]);
      await client.query('COMMIT');
      await this.auditChange(tenantId,actorId,'STOCK_MOVEMENT','inventory_item',itemId,{movementId:movement.rows[0].id,delta,after});
      return {duplicate:false,data:movement.rows[0],quantityOnHand:after,averageUnitCost:avg,stockValue:after*avg};
    } catch(e:unknown) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }
  async listCreditNotes(tenantId:string) {
    const r=await this.db.query(`SELECT c.*,i.invoice_number FROM customer_credit_notes c JOIN invoices i ON i.tenant_id=c.tenant_id AND i.id=c.invoice_id WHERE c.tenant_id=$1 ORDER BY c.created_at DESC LIMIT 500`,[tenantId]);
    return {data:r.rows};
  }
  async createCreditNote(tenantId:string,actorId:string,d:CreateCustomerCreditNoteDto) {
    const inv=await this.db.query('SELECT id,total,amount_paid,currency,status FROM invoices WHERE tenant_id=$1 AND id=$2',[tenantId,d.invoiceId]);
    if(!inv.rowCount) throw new NotFoundException('Invoice not found in this tenant');
    if(inv.rows[0].currency!==d.currency) throw new BadRequestException('Credit note currency must match invoice currency');
    if(inv.rows[0].status==='VOID') throw new ConflictException('Cannot credit a void invoice');
    const reserved=await this.db.query(`SELECT COALESCE(SUM(amount),0) AS amount FROM customer_credit_notes WHERE tenant_id=$1 AND invoice_id=$2 AND status IN ('ISSUED','APPLIED')`,[tenantId,d.invoiceId]);
    if(Number(d.amount)>Number(inv.rows[0].total)-Number(inv.rows[0].amount_paid)-Number(reserved.rows[0].amount)) throw new ConflictException('Credit exceeds remaining invoice balance');
    try {
      const r=await this.db.query(`INSERT INTO customer_credit_notes(tenant_id,invoice_id,credit_number,currency,amount,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[tenantId,d.invoiceId,d.creditNumber.trim(),d.currency,d.amount,d.reason.trim(),actorId]);
      await this.auditChange(tenantId,actorId,'CREATE','customer_credit_note',r.rows[0].id,{invoiceId:d.invoiceId,amount:d.amount,currency:d.currency});
      return r.rows[0];
    } catch(e:unknown) { if(typeof e==='object'&&e!==null&&'code' in e&&(e as {code?:string}).code==='23505') throw new ConflictException('Credit note number already exists in this tenant'); throw e; }
  }
  async transitionCreditNote(tenantId:string,actorId:string,id:string,action:'ISSUED'|'APPLIED') {
    const client=await this.db.connect();
    try {
      await client.query('BEGIN');
      const note=await client.query('SELECT * FROM customer_credit_notes WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);
      if(!note.rowCount) throw new NotFoundException('Credit note not found');
      const n=note.rows[0];
      if(action==='ISSUED') {
        if(n.status!=='DRAFT') throw new ConflictException('Only draft credit notes can be issued');
        const inv=await client.query('SELECT total,amount_paid,status,currency FROM invoices WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,n.invoice_id]);
        const reserved=await client.query(`SELECT COALESCE(SUM(amount),0) AS amount FROM customer_credit_notes WHERE tenant_id=$1 AND invoice_id=$2 AND id<>$3 AND status IN ('ISSUED','APPLIED')`,[tenantId,n.invoice_id,id]);
        if(!inv.rowCount||inv.rows[0].status==='VOID'||inv.rows[0].currency!==n.currency||Number(n.amount)>Number(inv.rows[0].total)-Number(inv.rows[0].amount_paid)-Number(reserved.rows[0].amount)) throw new ConflictException('Invoice balance no longer supports this credit note');
        await client.query("UPDATE customer_credit_notes SET status='ISSUED',issued_at=now() WHERE tenant_id=$1 AND id=$2",[tenantId,id]);
      } else {
        if(n.status!=='ISSUED') throw new ConflictException('Only issued credit notes can be applied');
        await client.query("UPDATE customer_credit_notes SET status='APPLIED' WHERE tenant_id=$1 AND id=$2",[tenantId,id]);
      }
      await client.query('COMMIT');
      await this.auditChange(tenantId,actorId,action,'customer_credit_note',id,{invoiceId:n.invoice_id,amount:n.amount,currency:n.currency});
      return {id,status:action};
    } catch(e:unknown) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }
  async getBranding(tenantId:string) {
    const r=await this.db.query('SELECT display_name AS "displayName",logo_url AS "logoUrl",primary_color AS "primaryColor",support_email AS "supportEmail",support_phone AS "supportPhone",portal_domain AS "portalDomain",notification_templates AS "notificationTemplates",updated_at AS "updatedAt" FROM tenant_branding WHERE tenant_id=$1',[tenantId]);
    return r.rows[0]??null;
  }
  async updateBranding(tenantId:string,actorId:string,d:UpdateBrandingDto) {
    const r=await this.db.query(`INSERT INTO tenant_branding(tenant_id,display_name,logo_url,primary_color,support_email,support_phone,portal_domain,updated_by,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()) ON CONFLICT(tenant_id) DO UPDATE SET display_name=EXCLUDED.display_name,logo_url=EXCLUDED.logo_url,
      primary_color=EXCLUDED.primary_color,support_email=EXCLUDED.support_email,support_phone=EXCLUDED.support_phone,portal_domain=EXCLUDED.portal_domain,updated_by=EXCLUDED.updated_by,updated_at=now()
      RETURNING display_name AS "displayName",logo_url AS "logoUrl",primary_color AS "primaryColor",support_email AS "supportEmail",support_phone AS "supportPhone",portal_domain AS "portalDomain",notification_templates AS "notificationTemplates",updated_at AS "updatedAt"`,
      [tenantId,d.displayName.trim(),d.logoUrl?.trim()||null,d.primaryColor??'#174ea6',d.supportEmail?.trim().toLowerCase()||null,d.supportPhone?.trim()||null,d.portalDomain?.trim().toLowerCase()||null,actorId]);
    await this.auditChange(tenantId,actorId,'UPDATE','tenant_branding',tenantId,{displayName:d.displayName,portalDomain:d.portalDomain??null});
    return r.rows[0];
  }
  async arAging(tenantId:string) {
    const r=await this.db.query(`SELECT bucket,currency,count(*)::int AS invoice_count,sum(outstanding)::numeric(20,2) AS outstanding
      FROM (SELECT i.currency,i.total AS outstanding,CASE WHEN i.status='PAID' OR i.status='VOID' THEN 'CURRENT' WHEN i.due_at IS NULL OR i.due_at>=now() THEN 'CURRENT' WHEN i.due_at>=now()-interval '30 days' THEN '1-30 DAYS' WHEN i.due_at>=now()-interval '60 days' THEN '31-60 DAYS' WHEN i.due_at>=now()-interval '90 days' THEN '61-90 DAYS' ELSE '90+ DAYS' END bucket FROM invoices i WHERE i.tenant_id=$1 AND i.status NOT IN ('PAID','VOID')) aged
      GROUP BY bucket,currency ORDER BY currency,CASE bucket WHEN 'CURRENT' THEN 0 WHEN '1-30 DAYS' THEN 1 WHEN '31-60 DAYS' THEN 2 WHEN '61-90 DAYS' THEN 3 ELSE 4 END`,[tenantId]);
    return {data:r.rows};
  }
  async listFinancialAudit(tenantId:string,limit=100) {
    const r=await this.db.query('SELECT id,actor_user_id,request_id,entity_type,entity_id,operation,before_data,after_data,occurred_at FROM financial_change_audit WHERE tenant_id=$1 ORDER BY occurred_at DESC LIMIT $2',[tenantId,Number.isFinite(limit)?Math.max(1,Math.min(500,Math.trunc(limit))):100]);
    return {data:r.rows};
  }
}
