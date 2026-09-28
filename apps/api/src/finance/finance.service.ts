import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { CreateAdjustmentDto, CreateCommissionDto, CreateDisputeDto, CreateInvoiceDto, CreateInvoiceLineDto, CreateLedgerAccountDto, CreateRefundDto, CreateResellerDto, ReconcileDto, TaxRateDto } from './finance.dto';

@Injectable()
export class FinanceService {
  constructor(@Inject(PG_POOL) private readonly db: Pool, private readonly audit: AuditService) {}

  private async auditMutation(tenantId:string, action:string, resourceType:string, resourceId:string|undefined, userId:string|undefined, metadata:Record<string,unknown>={}) {
    await this.audit.record(tenantId, action, resourceType, resourceId, metadata, { userId });
  }

  private async nextInvoiceNumber(tenantId:string) {
    const r=await this.db.query('SELECT next_invoice_number($1) AS number',[tenantId]);
    return r.rows[0].number as string;
  }

  async listInvoices(tenantId:string, customerId?:string) {
    const r=await this.db.query(`SELECT i.*, c.full_name AS "customerName", c.phone FROM invoices i LEFT JOIN customers c ON c.tenant_id=i.tenant_id AND c.id=i.customer_id WHERE i.tenant_id=$1 AND ($2::uuid IS NULL OR i.customer_id=$2) ORDER BY i.created_at DESC LIMIT 500`,[tenantId,customerId??null]);
    return {data:r.rows};
  }

  async addInvoiceLine(tenantId:string,invoiceId:string,input:CreateInvoiceLineDto) {
    const invoice=await this.db.query(`SELECT id,currency,status FROM invoices WHERE tenant_id=$1 AND id=$2`,[tenantId,invoiceId]);
    if(!invoice.rowCount) throw new NotFoundException('Invoice not found');
    if(invoice.rows[0].status==='PAID' || invoice.rows[0].status==='VOID') throw new ConflictException('Cannot modify a settled or void invoice');
    const quantity=Number(input.quantity), unitPrice=Number(input.unitPrice), taxAmount=Number(input.taxAmount);
    const subtotal=Math.round(quantity*unitPrice*1000000)/1000000, total=Math.round((subtotal+taxAmount)*1000000)/1000000;
    const line=await this.db.query(`INSERT INTO invoice_lines(tenant_id,invoice_id,description,quantity,unit_price,subtotal,tax_rate_id,tax_amount,total,currency) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[tenantId,invoiceId,input.description.trim(),quantity,unitPrice,subtotal,input.taxRateId??null,taxAmount,total,invoice.rows[0].currency]);
    await this.db.query(`UPDATE invoices SET subtotal=(SELECT COALESCE(SUM(subtotal),0) FROM invoice_lines WHERE tenant_id=$1 AND invoice_id=$2),tax_total=(SELECT COALESCE(SUM(tax_amount),0) FROM invoice_lines WHERE tenant_id=$1 AND invoice_id=$2),total=(SELECT COALESCE(SUM(total),0) FROM invoice_lines WHERE tenant_id=$1 AND invoice_id=$2),updated_at=now() WHERE tenant_id=$1 AND id=$2`,[tenantId,invoiceId]);
    await this.auditMutation(tenantId,'ADD_LINE','invoice_line',line.rows[0].id,undefined,{invoiceId,subtotal,total,currency:invoice.rows[0].currency});
    return line.rows[0];
  }

  async getInvoice(tenantId:string,id:string) {
    const r=await this.db.query(`SELECT i.*, c.full_name AS "customerName", c.phone FROM invoices i LEFT JOIN customers c ON c.tenant_id=i.tenant_id AND c.id=i.customer_id WHERE i.tenant_id=$1 AND i.id=$2`,[tenantId,id]);
    if(!r.rowCount) throw new NotFoundException('Invoice not found');
    const lines=await this.db.query(`SELECT * FROM invoice_lines WHERE tenant_id=$1 AND invoice_id=$2 ORDER BY created_at`,[tenantId,id]);
    return {...r.rows[0],lines:lines.rows};
  }

  async createInvoice(tenantId:string,input:CreateInvoiceDto,userId?:string) {
    const currency=input.currency.trim().toUpperCase();
    const total=Math.round((input.subtotal+input.taxTotal)*100)/100;
    if (input.purchaseId) {
      const p=await this.db.query(`SELECT id FROM wifi_plan_purchases WHERE tenant_id=$1 AND id=$2 AND customer_id=$3`,[tenantId,input.purchaseId,input.customerId]);
      if(!p.rowCount) throw new NotFoundException('Purchase not found for customer');
    }
    const number=input.invoiceNumber?.trim() || await this.nextInvoiceNumber(tenantId);
    try {
      const r=await this.db.query(`INSERT INTO invoices(tenant_id,customer_id,purchase_id,invoice_number,status,currency,subtotal,tax_total,total,issued_at,due_at) VALUES($1,$2,$3,$4,'ISSUED',$5,$6,$7,$8,now(),$9) RETURNING *`,[tenantId,input.customerId,input.purchaseId??null,number,currency,input.subtotal,input.taxTotal,total,input.dueAt??null]);
      await this.auditMutation(tenantId,'CREATE','invoice',r.rows[0].id,userId,{invoiceNumber:r.rows[0].invoice_number,total:r.rows[0].total,currency:r.rows[0].currency});
      return r.rows[0];
    } catch(e:any) {
      if(e?.code==='23505') throw new ConflictException('Invoice number or purchase invoice already exists');
      throw e;
    }
  }

  async markOverdueInvoices(tenantId:string) {
    const r = await this.db.query(
      `UPDATE invoices
          SET status='OVERDUE', updated_at=now()
        WHERE tenant_id=$1
          AND status IN ('ISSUED','PARTIALLY_PAID')
          AND due_at IS NOT NULL
          AND due_at < now()
        RETURNING id,invoice_number,customer_id,total,currency,status`,
      [tenantId],
    );
    for (const invoice of r.rows) {
      await this.auditMutation(tenantId,'MARK_OVERDUE','invoice',invoice.id,undefined,{
        invoiceNumber: invoice.invoice_number,
        total: invoice.total,
        currency: invoice.currency,
      });
    }
    return { updated: r.rowCount ?? 0, data: r.rows };
  }

  async listLedgerAccounts(tenantId:string) {
    const r=await this.db.query(`SELECT id,code,name,account_type AS "accountType",currency,status,created_at AS "createdAt" FROM financial_ledger_accounts WHERE tenant_id=$1 ORDER BY code`,[tenantId]);
    return {data:r.rows};
  }
  async createLedgerAccount(tenantId:string,input:CreateLedgerAccountDto) {
    const type=input.accountType.trim().toUpperCase(), currency=input.currency.trim().toUpperCase();
    if(!['ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE'].includes(type)) throw new ConflictException('Invalid ledger account type');
    try {
      const r=await this.db.query(`INSERT INTO financial_ledger_accounts(tenant_id,code,name,account_type,currency) VALUES($1,$2,$3,$4,$5) RETURNING id,code,name,account_type AS "accountType",currency,status`,[tenantId,input.code.trim().toUpperCase(),input.name.trim(),type,currency]);
      await this.auditMutation(tenantId,'CREATE','ledger_account',r.rows[0].id,undefined,{code:r.rows[0].code,accountType:r.rows[0].accountType,currency:r.rows[0].currency});
      return r.rows[0];
    } catch(e:any) { if(e?.code==='23505') throw new ConflictException('Ledger account code already exists'); throw e; }
  }
  async ledgerAccountBalance(tenantId:string,accountId:string) {
    const r=await this.db.query(`SELECT a.id,a.code,a.name,a.currency,COALESCE(SUM(e.debit-e.credit),0) AS balance FROM financial_ledger_accounts a LEFT JOIN financial_ledger_entries e ON e.tenant_id=a.tenant_id AND e.account_id=a.id WHERE a.tenant_id=$1 AND a.id=$2 GROUP BY a.id,a.code,a.name,a.currency`,[tenantId,accountId]);
    if(!r.rowCount) throw new NotFoundException('Ledger account not found'); return r.rows[0];
  }

  async listResellers(tenantId:string) { const r=await this.db.query(`SELECT * FROM resellers WHERE tenant_id=$1 ORDER BY created_at DESC`,[tenantId]); return {data:r.rows}; }
  async createReseller(tenantId:string,input:CreateResellerDto) {
    try { const r=await this.db.query(`INSERT INTO resellers(tenant_id,name,code,email,phone,commission_rate,settlement_currency) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[tenantId,input.name.trim(),input.code.trim().toUpperCase(),input.email??null,input.phone??null,input.commissionRate??0,(input.settlementCurrency??'TZS').toUpperCase()]); await this.auditMutation(tenantId,'CREATE','reseller',r.rows[0].id,undefined,{code:r.rows[0].code,commissionRate:r.rows[0].commission_rate}); return r.rows[0]; }
    catch(e:any){if(e?.code==='23505') throw new ConflictException('Reseller code already exists'); throw e;}
  }
  async updateResellerStatus(tenantId:string,id:string,status:string) {
    const s=status.trim().toUpperCase(); if(!['ACTIVE','SUSPENDED','CLOSED'].includes(s)) throw new ConflictException('Invalid reseller status');
    const r=await this.db.query(`UPDATE resellers SET status=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *`,[tenantId,id,s]);
    if(!r.rowCount) throw new NotFoundException('Reseller not found'); await this.auditMutation(tenantId,'STATUS_CHANGE','reseller',id,undefined,{status:s}); return r.rows[0];
  }

  async listCommissions(tenantId:string,resellerId?:string) {
    const r=await this.db.query(`SELECT c.*,r.name AS "resellerName",r.code AS "resellerCode" FROM commissions c JOIN resellers r ON r.tenant_id=c.tenant_id AND r.id=c.reseller_id WHERE c.tenant_id=$1 AND ($2::uuid IS NULL OR c.reseller_id=$2) ORDER BY c.created_at DESC LIMIT 500`,[tenantId,resellerId??null]); return {data:r.rows};
  }
  async accrueCommission(tenantId:string,input:CreateCommissionDto) {
    const r=await this.db.query(`SELECT r.commission_rate,r.status,p.id AS "purchaseId",pay.amount,p.currency,p.status AS "paymentStatus" FROM resellers r JOIN payments pay ON pay.tenant_id=r.tenant_id JOIN wifi_plan_purchases p ON p.tenant_id=pay.tenant_id AND p.id=pay.purchase_id WHERE r.tenant_id=$1 AND r.id=$2 AND pay.tenant_id=$1 AND pay.id=$3`,[tenantId,input.resellerId,input.paymentId]);
    if(!r.rowCount) throw new NotFoundException('Reseller or payment not found');
    const x=r.rows[0]; if(x.status!=='ACTIVE') throw new ConflictException('Reseller is not active'); if(x.paymentStatus!=='PAID') throw new ConflictException('Only successful payments can accrue commission');
    const amount=Number(x.amount), rate=Number(x.commission_rate), commission=Math.round(amount*rate)/100;
    try { const q=await this.db.query(`INSERT INTO commissions(tenant_id,reseller_id,purchase_id,payment_id,basis_amount,currency,rate,commission_amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (tenant_id,payment_id,reseller_id) DO UPDATE SET updated_at=now() RETURNING *`,[tenantId,input.resellerId,x.purchaseId,input.paymentId,amount,x.currency,rate,commission]); await this.auditMutation(tenantId,'ACCRUE','commission',q.rows[0].id,undefined,{resellerId:input.resellerId,paymentId:input.paymentId,amount:commission,currency:x.currency}); return q.rows[0]; }
    catch(e:any){throw e;}
  }

  async approveCommission(tenantId:string,commissionId:string) {
    const r=await this.db.query(`UPDATE commissions SET status='APPROVED',approved_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2 AND status='ACCRUED' RETURNING *`,[tenantId,commissionId]);
    if(!r.rowCount) throw new ConflictException('Commission is not in ACCRUED state'); await this.auditMutation(tenantId,'APPROVE','commission',commissionId,undefined,{amount:r.rows[0].commission_amount,currency:r.rows[0].currency}); return r.rows[0];
  }
  async markCommissionPaid(tenantId:string,commissionId:string) {
    const r=await this.db.query(`UPDATE commissions SET status='PAID',paid_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2 AND status='APPROVED' RETURNING *`,[tenantId,commissionId]);
    if(!r.rowCount) throw new ConflictException('Commission must be APPROVED before settlement'); await this.auditMutation(tenantId,'MARK_PAID','commission',commissionId,undefined,{amount:r.rows[0].commission_amount,currency:r.rows[0].currency}); return r.rows[0];
  }

  async listRefunds(tenantId:string) { const r=await this.db.query(`SELECT rf.*,pay.provider,pay.provider_reference AS "paymentReference" FROM refunds rf JOIN payments pay ON pay.tenant_id=rf.tenant_id AND pay.id=rf.payment_id WHERE rf.tenant_id=$1 ORDER BY rf.created_at DESC LIMIT 500`,[tenantId]); return {data:r.rows}; }
  async requestRefund(tenantId:string,input:CreateRefundDto) {
    const client=await this.db.connect();
    try {
      await client.query('BEGIN');
      const p=await client.query(`SELECT id,amount,currency,status FROM payments WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,[tenantId,input.paymentId]);
      if(!p.rowCount) throw new NotFoundException('Payment not found');
      const payment=p.rows[0];
      if(payment.status!=='PAID') throw new ConflictException('Only PAID payments can be refunded');
      const existing=await client.query(`SELECT * FROM refunds WHERE tenant_id=$1 AND idempotency_key=$2 FOR UPDATE`,[tenantId,input.idempotencyKey.trim()]);
      if(existing.rowCount) {
        const refund=existing.rows[0];
        if(refund.payment_id!==input.paymentId || Number(refund.amount)!==Number(input.amount)) throw new ConflictException('Refund idempotency key is already bound to another refund');
        await client.query('COMMIT');
        return refund;
      }
      const used=await client.query(`SELECT COALESCE(SUM(amount),0) AS total FROM refunds WHERE tenant_id=$1 AND payment_id=$2 AND status IN ('REQUESTED','APPROVED','PROCESSING','SUCCEEDED')`,[tenantId,input.paymentId]);
      if(Number(used.rows[0].total)+input.amount>Number(payment.amount)) throw new ConflictException('Refund exceeds settled payment amount');
      const r=await client.query(`INSERT INTO refunds(tenant_id,payment_id,amount,currency,reason,idempotency_key) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[tenantId,input.paymentId,input.amount,payment.currency,input.reason.trim(),input.idempotencyKey.trim()]);
      await client.query('COMMIT');
      await this.auditMutation(tenantId,'CREATE','refund',r.rows[0].id,undefined,{paymentId:input.paymentId,amount:input.amount,currency:payment.currency,idempotencyKey:input.idempotencyKey.trim()});
      return r.rows[0];
    } catch(error:any) {
      await client.query('ROLLBACK').catch(()=>undefined);
      if(error?.code==='23505') {
        const existing=await this.db.query(`SELECT * FROM refunds WHERE tenant_id=$1 AND idempotency_key=$2`,[tenantId,input.idempotencyKey.trim()]);
        if(existing.rowCount) return existing.rows[0];
      }
      throw error;
    } finally { client.release(); }
  }
  async approveRefund(tenantId:string,id:string,userId?:string) {
    const r=await this.db.query(`UPDATE refunds SET status='APPROVED',approved_by=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND status='REQUESTED' RETURNING *`,[tenantId,id,userId??null]);
    if(!r.rowCount) throw new ConflictException('Refund is not REQUESTED'); await this.auditMutation(tenantId,'APPROVE','refund',id,userId,{amount:r.rows[0].amount,currency:r.rows[0].currency}); return r.rows[0];
  }

  async listAdjustments(tenantId:string) { const r=await this.db.query(`SELECT * FROM financial_adjustments WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 500`,[tenantId]); return {data:r.rows}; }
  async createAdjustment(tenantId:string,input:CreateAdjustmentDto,userId?:string) {
    const d=input.direction.trim().toUpperCase(); if(!['DEBIT','CREDIT'].includes(d)) throw new ConflictException('Invalid adjustment direction');
    const r=await this.db.query(`INSERT INTO financial_adjustments(tenant_id,customer_id,purchase_id,amount,currency,direction,reason,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'PENDING',$8) RETURNING *`,[tenantId,input.customerId??null,input.purchaseId??null,input.amount,input.currency.toUpperCase(),d,input.reason.trim(),userId??null]); await this.auditMutation(tenantId,'CREATE','financial_adjustment',r.rows[0].id,userId,{amount:input.amount,currency:input.currency.toUpperCase(),direction:d}); return r.rows[0];
  }
  async approveAdjustment(tenantId:string,id:string,userId?:string) {
    const r=await this.db.query(`UPDATE financial_adjustments SET status='APPROVED',approved_by=$3,approved_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2 AND status='PENDING' RETURNING *`,[tenantId,id,userId??null]);
    if(!r.rowCount) throw new ConflictException('Adjustment is not PENDING'); await this.auditMutation(tenantId,'APPROVE','financial_adjustment',id,userId,{amount:r.rows[0].amount,currency:r.rows[0].currency,direction:r.rows[0].direction}); return r.rows[0];
  }

  async listDisputes(tenantId:string) { const r=await this.db.query(`SELECT d.*,p.provider,p.provider_reference AS "paymentReference" FROM payment_disputes d JOIN payments p ON p.tenant_id=d.tenant_id AND p.id=d.payment_id WHERE d.tenant_id=$1 ORDER BY d.created_at DESC LIMIT 500`,[tenantId]); return {data:r.rows}; }
  async createDispute(tenantId:string,input:CreateDisputeDto) {
    const p=await this.db.query(`SELECT amount,currency,status FROM payments WHERE tenant_id=$1 AND id=$2`,[tenantId,input.paymentId]); if(!p.rowCount) throw new NotFoundException('Payment not found');
    const r=await this.db.query(`INSERT INTO payment_disputes(tenant_id,payment_id,provider_case_id,amount,currency,reason_code,reason) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[tenantId,input.paymentId,input.providerCaseId??null,input.amount??p.rows[0].amount,input.currency?.toUpperCase()??p.rows[0].currency,input.reasonCode??null,input.reason??null]); return r.rows[0];
  }
  async resolveDispute(tenantId:string,id:string,status:string,resolution?:string) {
    const s=status.trim().toUpperCase(); if(!['WON','LOST','ACCEPTED','CLOSED'].includes(s)) throw new ConflictException('Invalid dispute resolution status');
    const r=await this.db.query(`UPDATE payment_disputes SET status=$3,resolution=$4,resolved_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2 AND status IN ('OPEN','UNDER_REVIEW') RETURNING *`,[tenantId,id,s,resolution??null]);
    if(!r.rowCount) throw new ConflictException('Dispute is not open'); await this.auditMutation(tenantId,'RESOLVE','payment_dispute',id,undefined,{status:s,resolution:resolution??null}); return r.rows[0];
  }

  async listTaxRates(tenantId:string) { const r=await this.db.query(`SELECT * FROM tax_rates WHERE tenant_id=$1 ORDER BY code`,[tenantId]); return {data:r.rows}; }
  async createTaxRate(tenantId:string,input:TaxRateDto) {
    try { const r=await this.db.query(`INSERT INTO tax_rates(tenant_id,code,name,rate,currency,country_code,is_inclusive) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[tenantId,input.code.trim().toUpperCase(),input.name.trim(),input.rate,input.currency?.toUpperCase()??null,input.countryCode?.toUpperCase()??null,input.isInclusive??false]); await this.auditMutation(tenantId,'CREATE','tax_rate',r.rows[0].id,undefined,{code:r.rows[0].code,rate:r.rows[0].rate,currency:r.rows[0].currency}); return r.rows[0]; }
    catch(e:any){if(e?.code==='23505') throw new ConflictException('Tax code already exists'); throw e;}
  }

  async reconcile(tenantId:string,input:ReconcileDto) {
    const start=new Date(input.periodStart), end=new Date(input.periodEnd);
    if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<=start) throw new ConflictException('Invalid reconciliation period');
    const run=await this.db.query(`INSERT INTO reconciliation_runs(tenant_id,provider,currency,period_start,period_end,status) VALUES($1,$2,$3,$4,$5,'RUNNING') RETURNING *`,[tenantId,input.provider?.trim().toLowerCase()??null,input.currency?.toUpperCase()??null,start.toISOString(),end.toISOString()]);
    const id=run.rows[0].id;
    const payments=await this.db.query(`SELECT id,provider,provider_reference,amount,currency FROM payments WHERE tenant_id=$1 AND status='PAID' AND created_at >= $2 AND created_at < $3 AND ($4::text IS NULL OR provider=$4) AND ($5::text IS NULL OR currency=$5) ORDER BY created_at`,[tenantId,start.toISOString(),end.toISOString(),input.provider?.trim().toLowerCase()??null,input.currency?.toUpperCase()??null]);
    let matched=0; for(const p of payments.rows){ await this.db.query(`INSERT INTO reconciliation_items(tenant_id,run_id,payment_id,provider,provider_reference,internal_amount,internal_currency,status,reason) VALUES($1,$2,$3,$4,$5,$6,$7,'UNMATCHED_INTERNAL',$8)`,[tenantId,id,p.id,p.provider,p.provider_reference??null,p.amount,p.currency,p.provider_reference?'Provider statement not supplied; internal record cannot be externally matched':'Missing provider reference']); }
    const unmatched=payments.rows.length;
    await this.db.query(`UPDATE reconciliation_runs SET status=$2,matched_count=0,unmatched_count=$4,mismatch_count=0,completed_at=now() WHERE tenant_id=$1 AND id=$5`,[tenantId,unmatched?'PARTIAL':'COMPLETED',0,unmatched,id]);
    return this.getReconciliation(tenantId,id);
  }
  async listReconciliations(tenantId:string){const r=await this.db.query(`SELECT * FROM reconciliation_runs WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100`,[tenantId]);return {data:r.rows};}
  async getReconciliation(tenantId:string,id:string){const r=await this.db.query(`SELECT * FROM reconciliation_runs WHERE tenant_id=$1 AND id=$2`,[tenantId,id]);if(!r.rowCount)throw new NotFoundException('Reconciliation run not found');const i=await this.db.query(`SELECT * FROM reconciliation_items WHERE tenant_id=$1 AND run_id=$2 ORDER BY created_at`,[tenantId,id]);return {...r.rows[0],items:i.rows};}
}
