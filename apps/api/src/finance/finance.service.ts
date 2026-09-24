import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { CreateInvoiceDto, CreateLedgerAccountDto } from './finance.dto';

@Injectable()
export class FinanceService {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  async listInvoices(tenantId:string, customerId?:string) {
    const r=await this.db.query(`SELECT id,customer_id AS "customerId",purchase_id AS "purchaseId",invoice_number AS "invoiceNumber",status,currency,subtotal,tax_total AS "taxTotal",total,issued_at AS "issuedAt",due_at AS "dueAt",paid_at AS "paidAt",created_at AS "createdAt" FROM invoices WHERE tenant_id=$1 AND ($2::uuid IS NULL OR customer_id=$2) ORDER BY created_at DESC LIMIT 500`,[tenantId,customerId??null]);
    return {data:r.rows};
  }

  async createInvoice(tenantId:string,input:CreateInvoiceDto) {
    const currency=input.currency.trim().toUpperCase();
    if (input.taxTotal+input.subtotal < 0) throw new ConflictException('Invoice total cannot be negative');
    const total=Math.round((input.subtotal+input.taxTotal)*100)/100;
    if (input.purchaseId) {
      const p=await this.db.query(`SELECT id FROM wifi_plan_purchases WHERE tenant_id=$1 AND id=$2 AND customer_id=$3`,[tenantId,input.purchaseId,input.customerId]);
      if(!p.rowCount) throw new NotFoundException('Purchase not found for customer');
    }
    try {
      const r=await this.db.query(`INSERT INTO invoices(tenant_id,customer_id,purchase_id,invoice_number,status,currency,subtotal,tax_total,total,issued_at,due_at) VALUES($1,$2,$3,$4,'ISSUED',$5,$6,$7,$8,now(),$9) RETURNING id,customer_id AS "customerId",purchase_id AS "purchaseId",invoice_number AS "invoiceNumber",status,currency,subtotal,tax_total AS "taxTotal",total,issued_at AS "issuedAt",due_at AS "dueAt"`,[tenantId,input.customerId,input.purchaseId??null,input.invoiceNumber.trim(),currency,input.subtotal,input.taxTotal,total,input.dueAt??null]);
      return r.rows[0];
    } catch(e:any) {
      if(e?.code==='23505') throw new ConflictException('Invoice number or purchase invoice already exists');
      throw e;
    }
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
      return r.rows[0];
    } catch(e:any) {
      if(e?.code==='23505') throw new ConflictException('Ledger account code already exists');
      throw e;
    }
  }

  async ledgerAccountBalance(tenantId:string,accountId:string) {
    const r=await this.db.query(`SELECT a.id,a.code,a.name,a.currency,COALESCE(SUM(e.debit-e.credit),0) AS balance FROM financial_ledger_accounts a LEFT JOIN financial_ledger_entries e ON e.tenant_id=a.tenant_id AND e.account_id=a.id WHERE a.tenant_id=$1 AND a.id=$2 GROUP BY a.id,a.code,a.name,a.currency`,[tenantId,accountId]);
    if(!r.rowCount) throw new NotFoundException('Ledger account not found');
    return r.rows[0];
  }
}
