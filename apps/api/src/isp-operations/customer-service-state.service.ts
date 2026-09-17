import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { ChangeCustomerServiceStateDto } from './isp-operations.dto';

@Injectable()
export class CustomerServiceStateService {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  async get(tenantId:string,customerId:string){const result=await this.db.query(`SELECT id,customer_id AS "customerId",state,reason,source,effective_at AS "effectiveAt",expires_at AS "expiresAt",created_at AS "createdAt" FROM customer_service_state WHERE tenant_id=$1 AND customer_id=$2`,[tenantId,customerId]);if(!result.rowCount)throw new NotFoundException('Customer service state not found');return result.rows[0];}

  async set(tenantId:string,customerId:string,input:ChangeCustomerServiceStateDto){
    const client=await this.db.connect();
    try{await client.query('BEGIN');
      const customer=await client.query('SELECT 1 FROM customers WHERE tenant_id=$1 AND id=$2',[tenantId,customerId]);if(!customer.rowCount)throw new NotFoundException('Customer not found');
      const current=await client.query('SELECT state FROM customer_service_state WHERE tenant_id=$1 AND customer_id=$2 FOR UPDATE',[tenantId,customerId]);
      const previous=current.rows[0]?.state??null;
      const result=await client.query(`INSERT INTO customer_service_state (tenant_id,customer_id,state,reason,source,effective_at,expires_at) VALUES ($1,$2,$3,$4,$5,COALESCE($6::timestamptz,now()),$7) ON CONFLICT (tenant_id,customer_id) DO UPDATE SET state=EXCLUDED.state,reason=EXCLUDED.reason,source=EXCLUDED.source,effective_at=EXCLUDED.effective_at,expires_at=EXCLUDED.expires_at RETURNING id,customer_id AS "customerId",state,reason,source,effective_at AS "effectiveAt",expires_at AS "expiresAt",created_at AS "createdAt"`,[tenantId,customerId,input.state,input.reason.trim(),input.source?.trim()||'API',input.effectiveAt??null,input.expiresAt??null]);
      if(previous!==input.state)await client.query(`INSERT INTO customer_service_state_events (tenant_id,customer_id,previous_state,new_state,reason,source,effective_at) VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz,now()))`,[tenantId,customerId,previous,input.state,input.reason.trim(),input.source?.trim()||'API',input.effectiveAt??null]);
      await client.query('COMMIT');return result.rows[0];
    }catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}finally{client.release();}
  }

  async history(tenantId:string,customerId:string){const result=await this.db.query(`SELECT id,previous_state AS "previousState",new_state AS "newState",reason,source,effective_at AS "effectiveAt",created_at AS "createdAt" FROM customer_service_state_events WHERE tenant_id=$1 AND customer_id=$2 ORDER BY created_at DESC`,[tenantId,customerId]);return result.rows;}
}
