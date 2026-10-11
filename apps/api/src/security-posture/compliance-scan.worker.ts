import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { SecurityPostureService } from './security-posture.service';

@Injectable()
export class ComplianceScanWorker implements OnModuleInit,OnModuleDestroy {
  private readonly logger=new Logger(ComplianceScanWorker.name);
  private timer?:NodeJS.Timeout;
  private running=false;
  constructor(@Inject(PG_POOL) private readonly db:Pool,private readonly posture:SecurityPostureService){}
  onModuleInit(){this.timer=setInterval(()=>{void this.tick();},6*60*60*1000);void this.tick();}
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
  async tick(){
    if(this.running)return;this.running=true;
    const client=await this.db.connect().catch((e:unknown)=>{this.logger.error('Compliance scan worker could not connect',e instanceof Error?e.stack:undefined);return null;});
    if(!client){this.running=false;return;}
    let locked=false;
    try{
      const result=await client.query<{acquired:boolean}>('SELECT pg_try_advisory_lock($1) AS acquired',[7_421_955]);
      locked=Boolean(result.rows[0]?.acquired);if(!locked)return;
      await this.posture.runAllTenantScans();
    }catch(e){this.logger.error('Scheduled compliance scan failed',e instanceof Error?e.stack:undefined);}
    finally{if(locked)await client.query('SELECT pg_advisory_unlock($1)',[7_421_955]).catch(()=>undefined);client.release();this.running=false;}
  }
}
