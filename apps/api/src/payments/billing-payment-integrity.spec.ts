import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { Pool } from 'pg';
import { PaymentsService } from './payments.service';

const migration = readFileSync(
  join(__dirname, '../../../migrations/061_billing_payment_integrity.sql'),
  'utf8',
);

describe('Billing & Payment Integrity', () => {
  it.each([
    ['duplicate payment', 'payments_one_active_attempt_per_purchase_uq'],
    ['replayed webhook', 'payment_events'],
    ['concurrent payment', 'FOR UPDATE'],
    ['failed payment', "status='FAILED'"],
    ['delayed webhook', "status='PAID'"],
    ['refund', 'refunds_tenant_idempotency_uq'],
    ['partial fulfillment', 'access_grants_state_transition_trg'],
    ['expired entitlement', "SUSPENDED','EXPIRED','REVOKED"],
  ])('contains the invariant for %s', (_name, invariant) => {
    expect(migration).toContain(invariant);
  });

  it('defines the complete payment state set', () => {
    for (const state of ['INITIATED','PENDING','AUTHORIZED','PAID','FAILED','CANCELLED','REVERSED','REFUNDED']) {
      expect(migration).toContain(`'${state}'`);
    }
  });

  it('makes ledger transactions and entries immutable', () => {
    expect(migration).toContain('financial_ledger_transactions_immutable_trg');
    expect(migration).toContain('financial_ledger_entries_immutable_trg');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON financial_ledger_transactions');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON financial_ledger_entries');
  });

  it('reuses an idempotency key instead of creating another payment intent', async () => {
    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rowCount: 0, rows: [] };
        if (sql.includes('FROM wifi_plan_purchases')) return { rowCount: 1, rows: [{ customer_id:'c1', price:'1000', currency:'TZS', status:'PENDING_PAYMENT' }] };
        if (sql.includes('FROM payment_provider_configs')) return { rowCount: 1, rows: [{ metadata:{} }] };
        if (sql.includes('FROM payments WHERE tenant_id=$1 AND idempotency_key')) return { rowCount:1, rows:[{id:'p1',status:'INITIATED',provider:'mpesa'}] };
        return { rowCount:0, rows:[] };
      }),
      release: jest.fn(),
    };
    const db={connect:jest.fn().mockResolvedValue(client)} as unknown as Pool;
    const service=new PaymentsService(db,new ConfigService());
    await expect(service.createIntent('t1',{purchaseId:'00000000-0000-0000-0000-000000000001',provider:'mpesa',idempotencyKey:'idem-1'}))
      .resolves.toMatchObject({id:'p1',reused:true});
  });

  it('rejects a replayed webhook without reprocessing the payment', async () => {
    const secret='secret';
    const rawBody=Buffer.from('{"event":"payment.success"}');
    const signature=createHmac('sha256',secret).update(rawBody).digest('hex');
    const client={
      query:jest.fn(async(sql:string)=>{
        if(sql==='BEGIN') return {rowCount:0,rows:[]};
        if(sql.includes('INSERT INTO payment_events')) return {rowCount:0,rows:[]};
        if(sql.includes('FROM payment_events')) return {rowCount:1,rows:[{id:'e1',eventType:'payment.success',processingStatus:'PROCESSED',paymentId:'p1'}]};
        if(sql==='COMMIT') return {rowCount:0,rows:[]};
        return {rowCount:0,rows:[]};
      }),
      release:jest.fn(),
    };
    const db={
      query:jest.fn().mockResolvedValue({rowCount:1,rows:[{webhookSecretRef:'PAYMENT_WEBHOOK_SECRET'}]}),
      connect:jest.fn().mockResolvedValue(client),
    } as unknown as Pool;
    const config={get:jest.fn().mockReturnValue(secret)} as unknown as ConfigService;
    const service=new PaymentsService(db,config);
    await expect(service.webhook('t1',{provider:'mpesa',providerEventId:'evt-1',eventType:'payment.success',status:'SUCCESS',paymentId:'p1'},rawBody,signature))
      .resolves.toMatchObject({duplicate:true,paymentId:'p1'});
    expect(client.query).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE payments'));
  });

  it('moves a delayed signed webhook from PENDING to PAID', async () => {
    const secret='secret';
    const rawBody=Buffer.from('{"event":"payment.success","amount":1000,"currency":"TZS"}');
    const signature=createHmac('sha256',secret).update(rawBody).digest('hex');
    const client={
      query:jest.fn(async(sql:string)=>{
        if(sql==='BEGIN'||sql==='COMMIT') return {rowCount:0,rows:[]};
        if(sql.includes('INSERT INTO payment_events')) return {rowCount:1,rows:[{id:'e2'}]};
        if(sql.includes('FROM payments') && sql.includes('FOR UPDATE')) return {rowCount:1,rows:[{id:'p2',status:'PENDING',amount:'1000',currency:'TZS',provider:'mpesa',purchaseId:'pu2',correlationId:'c2'}]};
        if(sql.includes('UPDATE payments')) return {rowCount:1,rows:[]};
        if(sql.includes('UPDATE payment_events')) return {rowCount:1,rows:[]};
        return {rowCount:0,rows:[]};
      }),
      release:jest.fn(),
    };
    const db={query:jest.fn().mockResolvedValue({rowCount:1,rows:[{webhookSecretRef:'PAYMENT_WEBHOOK_SECRET'}]}),connect:jest.fn().mockResolvedValue(client)} as unknown as Pool;
    const config={get:jest.fn().mockReturnValue(secret)} as unknown as ConfigService;
    const service=new PaymentsService(db,config);
    await expect(service.webhook('t1',{provider:'mpesa',providerEventId:'evt-2',eventType:'payment.success',status:'SUCCESS',paymentId:'p2',amount:1000,currency:'TZS'},rawBody,signature))
      .resolves.toMatchObject({status:'PAID',paymentId:'p2'});
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("status=$3"),expect.any(Array));
  });

  it('moves a failed provider response to FAILED', async () => {
    const secret='secret';
    const rawBody=Buffer.from('{"event":"payment.failed"}');
    const signature=createHmac('sha256',secret).update(rawBody).digest('hex');
    const client={
      query:jest.fn(async(sql:string)=>{
        if(sql==='BEGIN'||sql==='COMMIT') return {rowCount:0,rows:[]};
        if(sql.includes('INSERT INTO payment_events')) return {rowCount:1,rows:[{id:'e3'}]};
        if(sql.includes('FROM payments') && sql.includes('FOR UPDATE')) return {rowCount:1,rows:[{id:'p3',status:'AUTHORIZED',amount:'1000',currency:'TZS',provider:'mpesa',purchaseId:'pu3',correlationId:'c3'}]};
        if(sql.includes('UPDATE payments')) return {rowCount:1,rows:[]};
        if(sql.includes('UPDATE payment_events')) return {rowCount:1,rows:[]};
        return {rowCount:0,rows:[]};
      }),
      release:jest.fn(),
    };
    const db={query:jest.fn().mockResolvedValue({rowCount:1,rows:[{webhookSecretRef:'PAYMENT_WEBHOOK_SECRET'}]}),connect:jest.fn().mockResolvedValue(client)} as unknown as Pool;
    const config={get:jest.fn().mockReturnValue(secret)} as unknown as ConfigService;
    const service=new PaymentsService(db,config);
    await expect(service.webhook('t1',{provider:'mpesa',providerEventId:'evt-3',eventType:'payment.failed',status:'FAILED',paymentId:'p3'},rawBody,signature))
      .resolves.toMatchObject({status:'FAILED',paymentId:'p3'});
  });

  it('handles a full provider refund as a terminal REFUNDED payment state', async () => {
    const secret='secret';
    const rawBody=Buffer.from('{"event":"payment.refunded","amount":1000,"currency":"TZS"}');
    const signature=createHmac('sha256',secret).update(rawBody).digest('hex');
    const client={
      query:jest.fn(async(sql:string)=>{
        if(sql==='BEGIN'||sql==='COMMIT') return {rowCount:0,rows:[]};
        if(sql.includes('INSERT INTO payment_events')) return {rowCount:1,rows:[{id:'e4'}]};
        if(sql.includes('FROM payments') && sql.includes('FOR UPDATE')) return {rowCount:1,rows:[{id:'p4',status:'PAID',amount:'1000',currency:'TZS',provider:'mpesa',purchaseId:'pu4',correlationId:'c4'}]};
        if(sql.includes('SELECT COALESCE(SUM(amount)')) return {rowCount:1,rows:[{total:'0'}]};
        if(sql.includes('INSERT INTO refunds')) return {rowCount:1,rows:[{id:'r4'}]};
        if(sql.includes('SELECT id FROM financial_ledger_accounts')) return {rowCount:0,rows:[]};
        if(sql.includes("UPDATE payments SET status='REFUNDED'")) return {rowCount:1,rows:[]};
        if(sql.includes('UPDATE payment_events')) return {rowCount:1,rows:[]};
        return {rowCount:0,rows:[]};
      }),
      release:jest.fn(),
    };
    const db={query:jest.fn().mockResolvedValue({rowCount:1,rows:[{webhookSecretRef:'PAYMENT_WEBHOOK_SECRET'}]}),connect:jest.fn().mockResolvedValue(client)} as unknown as Pool;
    const config={get:jest.fn().mockReturnValue(secret)} as unknown as ConfigService;
    const service=new PaymentsService(db,config);
    await expect(service.webhook('t1',{provider:'mpesa',providerEventId:'evt-4',eventType:'payment.refunded',status:'REFUNDED',paymentId:'p4',amount:1000,currency:'TZS'},rawBody,signature))
      .resolves.toMatchObject({status:'REFUNDED',paymentId:'p4'});
  });
});
