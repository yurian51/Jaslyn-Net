import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';

@Injectable()
export class WorkflowsWorker implements OnModuleInit,OnModuleDestroy {
  private readonly logger=new Logger(WorkflowsWorker.name);
  private timer?:NodeJS.Timeout;
  private running=false;
  constructor(private readonly workflows:WorkflowsService){}
  onModuleInit(){this.timer=setInterval(()=>{void this.tick();},5000);void this.tick();}
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
  async tick(){
    if(this.running)return;
    this.running=true;
    try { await this.workflows.scheduleAndCollect(); await this.workflows.processQueued(); }
    catch(e){this.logger.error('Workflow worker cycle failed',e instanceof Error?e.stack:undefined);}
    finally {this.running=false;}
  }
}
