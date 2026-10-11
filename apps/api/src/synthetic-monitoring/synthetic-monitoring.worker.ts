import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SyntheticMonitoringService } from './synthetic-monitoring.service';

@Injectable()
export class SyntheticMonitoringWorker implements OnModuleInit,OnModuleDestroy {
  private readonly logger=new Logger(SyntheticMonitoringWorker.name);
  private timer?:NodeJS.Timeout;
  private running=false;
  constructor(private readonly monitors:SyntheticMonitoringService){}
  onModuleInit(){this.timer=setInterval(()=>{void this.tick();},15_000);void this.tick();}
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
  async tick(){
    if(this.running)return;this.running=true;
    try{await this.monitors.runDueChecks();}
    catch(e){this.logger.error('Synthetic monitoring cycle failed',e instanceof Error?e.stack:undefined);}
    finally{this.running=false;}
  }
}
