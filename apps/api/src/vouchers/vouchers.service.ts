import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { CreateVoucherBatchDto, RedeemVoucherDto } from './vouchers.dto';

@Injectable()
export class VouchersService {
  constructor(@Inject(PG_POOL) private readonly db: Pool, private readonly audit: AuditService) {}

  private generateCode(format: CreateVoucherBatchDto['codeFormat'] = 'LETTERS_NUMBERS') {
    const alphabet = format === 'NUMBERS' ? '0123456789' : format === 'LETTERS' ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let output = '';
    const bytes = randomBytes(12);
    for (let i=0;i<10;i++) output += alphabet[bytes[i] % alphabet.length];
    return output;
  }

  private assertBatchQuantity(quantity:number) {
    if(!Number.isInteger(quantity)||quantity<1||quantity>10000) throw new ConflictException('Voucher quantity must be between 1 and 10,000');
  }

  async list(tenantId:string) {
    const result=await this.db.query(
      `SELECT v.id,v.code,v.package_id AS "packageId",v.status,v.expires_at AS "expiresAt",v.used_at AS "usedAt",
              v.device_limit AS "deviceLimit",v.batch_id AS "batchId",p.name AS "packageName",
              b.code_format AS "codeFormat",b.print_size AS "printSize",b.print_style AS "printStyle"
       FROM vouchers v JOIN packages p ON p.id=v.package_id AND p.tenant_id=v.tenant_id
       LEFT JOIN voucher_batches b ON b.id=v.batch_id AND b.tenant_id=v.tenant_id
       WHERE v.tenant_id=$1 ORDER BY v.created_at DESC LIMIT 500`,
      [tenantId],
    );
    return {data:result.rows};
  }

  async createBatch(tenantId:string,input:CreateVoucherBatchDto) {
    this.assertBatchQuantity(input.quantity);
    const client=await this.db.connect();
    try {
      await client.query('BEGIN');
      const pkg=await client.query(
        `SELECT id,name,devices_per_code,is_free_trial FROM packages WHERE tenant_id=$1 AND id=$2 AND is_active=true FOR SHARE`,
        [tenantId,input.packageId],
      );
      if(!pkg.rowCount) throw new NotFoundException('Active package not found');
      const expiresAt=input.expiresInSeconds?new Date(Date.now()+input.expiresInSeconds*1000):null;
      const batch=await client.query(
        `INSERT INTO voucher_batches(tenant_id,package_id,quantity,code_format,print_size,print_style)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
        [tenantId,input.packageId,input.quantity,input.codeFormat??'LETTERS_NUMBERS',input.printSize??'MINI',input.printStyle??'CLASSIC'],
      );
      const created:string[]=[];
      for(let i=0;i<input.quantity;i++){
        let inserted=false;
        for(let attempt=0;attempt<5&&!inserted;attempt++){
          try{
            const row=await client.query(
              `INSERT INTO vouchers(tenant_id,package_id,code,status,expires_at,batch_id,device_limit)
               VALUES($1,$2,$3,'UNUSED',$4,$5,$6) RETURNING code`,
              [tenantId,input.packageId,this.generateCode(input.codeFormat),expiresAt,batch.rows[0].id,pkg.rows[0].devices_per_code??1],
            );
            created.push(row.rows[0].code);inserted=true;
          }catch(error:any){if(error?.code!=='23505')throw error}
        }
        if(!inserted) throw new ConflictException('Could not generate a unique voucher code');
      }
      await client.query('COMMIT');
      await this.audit.record(tenantId,'VOUCHER_BATCH_CREATED','voucher',undefined,{batchId:batch.rows[0].id,packageId:input.packageId,packageName:pkg.rows[0].name,quantity:created.length,expiresAt,codeFormat:input.codeFormat??'LETTERS_NUMBERS',printSize:input.printSize??'MINI',printStyle:input.printStyle??'CLASSIC'});
      return {count:created.length,codes:created,packageId:input.packageId,batchId:batch.rows[0].id,expiresAt,codeFormat:input.codeFormat??'LETTERS_NUMBERS',printSize:input.printSize??'MINI',printStyle:input.printStyle??'CLASSIC',isFreeTrial:Boolean(pkg.rows[0].is_free_trial)};
    }catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error}finally{client.release()}
  }

  async redeem(tenantId:string,code:string,input:RedeemVoucherDto) {
    const client=await this.db.connect();
    try{
      await client.query('BEGIN');
      const voucher=await client.query(
        `SELECT v.id,v.package_id,v.status,v.expires_at,v.device_limit,p.duration_seconds,p.price,p.currency,p.name AS package_name,
                p.is_free_trial,p.free_trial_frequency,c.phone
         FROM vouchers v JOIN packages p ON p.id=v.package_id AND p.tenant_id=v.tenant_id
         JOIN customers c ON c.tenant_id=$1 AND c.id=$2
         WHERE v.tenant_id=$1 AND v.code=$3 FOR UPDATE`,
        [tenantId,input.customerId,code.trim().toUpperCase()],
      );
      if(!voucher.rowCount) throw new NotFoundException('Voucher or customer not found');
      const v=voucher.rows[0];
      if(v.status!=='UNUSED') throw new ConflictException('Voucher is '+v.status);
      if(v.expires_at&&new Date(v.expires_at).getTime()<=Date.now()){await client.query('UPDATE vouchers SET status=\'EXPIRED\' WHERE tenant_id=$1 AND id=$2',[tenantId,v.id]);throw new ConflictException('Voucher has expired')}
      if(v.is_free_trial&&v.free_trial_frequency!=='UNLIMITED'){
        const trial= v.free_trial_frequency==='ONCE_PER_PHONE'
          ? await client.query(`SELECT 1 FROM wifi_plan_purchases p JOIN customers c ON c.tenant_id=p.tenant_id AND c.id=p.customer_id WHERE p.tenant_id=$1 AND p.package_id=$2 AND c.phone IS NOT NULL AND c.phone=$3 LIMIT 1`,[tenantId,v.package_id,v.phone])
          : await client.query(`SELECT 1 FROM wifi_plan_purchases WHERE tenant_id=$1 AND package_id=$2 AND customer_id=$3 LIMIT 1`,[tenantId,v.package_id,input.customerId]);
        if(trial.rowCount) throw new ConflictException('This free trial has already been claimed for the configured frequency');
      }
      const customer=await client.query('SELECT id,is_active FROM customers WHERE tenant_id=$1 AND id=$2 FOR SHARE',[tenantId,input.customerId]);
      if(!customer.rowCount) throw new NotFoundException('Customer not found');
      if(!customer.rows[0].is_active) throw new ConflictException('Customer is inactive');
      if(input.routerId){const router=await client.query('SELECT id,status FROM routers WHERE tenant_id=$1 AND id=$2 FOR SHARE',[tenantId,input.routerId]);if(!router.rowCount)throw new NotFoundException('Router not found')}
      const purchase=await client.query(
        `INSERT INTO wifi_plan_purchases(tenant_id,customer_id,package_id,router_id,price,currency,status,starts_at,ends_at)
         VALUES($1,$2,$3,$4,$5,$6,'PAID',now(),now()+($7::bigint*interval '1 second')) RETURNING id,starts_at AS "startsAt",ends_at AS "endsAt"`,
        [tenantId,input.customerId,v.package_id,input.routerId??null,v.price,v.currency,v.duration_seconds],
      );
      await client.query(
        `INSERT INTO access_grants(tenant_id,purchase_id,customer_id,router_id,status,starts_at,ends_at)
         VALUES($1,$2,$3,$4,'ACTIVE',(SELECT starts_at FROM wifi_plan_purchases WHERE id=$2),(SELECT ends_at FROM wifi_plan_purchases WHERE id=$2))
         ON CONFLICT(purchase_id) DO UPDATE SET status='ACTIVE',starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,updated_at=now()`,
        [tenantId,purchase.rows[0].id,input.customerId,input.routerId??null],
      );
      await client.query('UPDATE vouchers SET status=\'USED\',used_at=now() WHERE tenant_id=$1 AND id=$2',[tenantId,v.id]);
      await client.query('COMMIT');
      await this.audit.record(tenantId,'VOUCHER_REDEEMED','voucher',v.id,{customerId:input.customerId,packageId:v.package_id,purchaseId:purchase.rows[0].id,routerId:input.routerId??null,deviceLimit:v.device_limit});
      return {redeemed:true,voucherId:v.id,purchaseId:purchase.rows[0].id,startsAt:purchase.rows[0].startsAt,endsAt:purchase.rows[0].endsAt,deviceLimit:v.device_limit};
    }catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error}finally{client.release()}
  }
}
