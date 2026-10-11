import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

@Injectable()
export class MaintenanceWindowWorker implements OnModuleInit,OnModuleDestroy {
  private readonly logger=new Logger(MaintenanceWindowWorker.name);
  private timer?:NodeJS.Timeout;
  private running=false;
  constructor(@Inject(PG_POOL) private readonly db:Pool){}
  onModuleInit(){this.timer=setInterval(()=>{void this.tick();},30_000);void this.tick();}
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
  async tick(){
    if(this.running)return;this.running=true;const client=await this.db.connect().catch((e:unknown)=>{this.logger.error('Maintenance window worker could not connect',e instanceof Error?e.stack:undefined);return null;});
    if(!client){this.running=false;return;}
    try{
      await client.query('BEGIN');
      const active=await client.query(`UPDATE maintenance_windows SET status='ACTIVE',updated_at=now() WHERE status='PLANNED' AND starts_at<=now() AND ends_at>now() RETURNING id,tenant_id,title`);
      for(const row of active.rows)await client.query(`INSERT INTO audit_logs(tenant_id,action,resource_type,resource_id,metadata) VALUES($1,'MAINTENANCE_WINDOW_ACTIVATED','maintenance_window',$2,$3::jsonb)`,[row.tenant_id,row.id,JSON.stringify({title:row.title,automated:true})]);
      const completed=await client.query(`UPDATE maintenance_windows SET status='COMPLETED',updated_at=now() WHERE status IN ('PLANNED','ACTIVE') AND ends_at<=now() RETURNING id,tenant_id,title`);
      for(const row of completed.rows)await client.query(`INSERT INTO audit_logs(tenant_id,action,resource_type,resource_id,metadata) VALUES($1,'MAINTENANCE_WINDOW_COMPLETED','maintenance_window',$2,$3::jsonb)`,[row.tenant_id,row.id,JSON.stringify({title:row.title,automated:true})]);
      await client.query('COMMIT');
    }catch(e){await client.query('ROLLBACK').catch(()=>undefined);this.logger.error('Maintenance window lifecycle cycle failed',e instanceof Error?e.stack:undefined);}
    finally{client.release();this.running=false;}
  }
}
