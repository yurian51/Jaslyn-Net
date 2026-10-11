import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { RevenueAssuranceService } from './revenue-assurance.service';

@Injectable()
export class RevenueAssuranceWorker implements OnModuleInit,OnModuleDestroy {
  private readonly logger=new Logger(RevenueAssuranceWorker.name);
  private timer?:NodeJS.Timeout;
  private running=false;
  constructor(@Inject(PG_POOL) private readonly db:Pool,private readonly assurance:RevenueAssuranceService){}
  onModuleInit(){this.timer=setInterval(()=>{void this.tick();},6*60*60*1000);void this.tick();}
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
  async tick(){
    if(this.running)return;this.running=true;
    const client=await this.db.connect().catch((e:unknown)=>{this.logger.error('Revenue assurance worker could not connect',e instanceof Error?e.stack:undefined);return null;});
    if(!client){this.running=false;return;}
    let locked=false;
    try{const r=await client.query<{acquired:boolean}>('SELECT pg_try_advisory_lock($1) AS acquired',[7_421_966]);locked=Boolean(r.rows[0]?.acquired);if(!locked)return;const results=await this.assurance.runAllTenantReconciliations();for(const result of results)if(result.status==='FAILED')this.logger.error('Tenant revenue reconciliation failed for '+result.tenantId+': '+result.error);}
    catch(e){this.logger.error('Scheduled revenue reconciliation failed',e instanceof Error?e.stack:undefined);}
    finally{if(locked)await client.query('SELECT pg_advisory_unlock($1)',[7_421_966]).catch(()=>undefined);client.release();this.running=false;}
  }
}
