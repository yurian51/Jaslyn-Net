import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AutomationService } from './automation.service';

@Injectable()
export class AutomationWorker implements OnModuleInit,OnModuleDestroy {
  private readonly logger=new Logger(AutomationWorker.name);
  private timer?:NodeJS.Timeout;
  private running=false;
  constructor(private readonly automation:AutomationService){}
  onModuleInit(){this.timer=setInterval(()=>{void this.tick();},5000);void this.tick();}
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
  async tick(){if(this.running)return;this.running=true;try{await this.automation.runDueEvents();}catch(e){this.logger.error('Automation rule cycle failed',e instanceof Error?e.stack:undefined);}finally{this.running=false;}}
}
