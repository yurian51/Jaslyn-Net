import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { AutomationWorker } from './automation.worker';

@Module({imports:[AuditModule],controllers:[AutomationController],providers:[AutomationService,AutomationWorker],exports:[AutomationService]})
export class AutomationModule {}
