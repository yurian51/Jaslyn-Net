import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommandsModule } from '../commands/commands.module';
import { AutomationActionExecutor } from './automation.actions';
import { AutomationConfig } from './automation.config';
import { AutomationController } from './automation.controller';
import { AutomationFanoutService } from './automation.fanout.service';
import { AutomationOpsService } from './automation.ops.service';
import { AutomationPolicyService } from './automation.policy';
import { AutomationJobRunner } from './automation.runner';
import { AutomationService } from './automation.service';
import { AutomationWorker } from './automation.worker';

@Module({
  imports: [AuditModule, CommandsModule],
  controllers: [AutomationController],
  providers: [AutomationConfig, AutomationService, AutomationOpsService, AutomationPolicyService, AutomationActionExecutor, AutomationFanoutService, AutomationJobRunner, AutomationWorker],
  exports: [AutomationService, AutomationOpsService],
})
export class AutomationModule {}
