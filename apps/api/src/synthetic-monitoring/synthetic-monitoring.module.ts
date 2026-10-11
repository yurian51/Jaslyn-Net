import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SyntheticMonitoringController } from './synthetic-monitoring.controller';
import { SyntheticMonitoringService } from './synthetic-monitoring.service';
import { SyntheticMonitoringWorker } from './synthetic-monitoring.worker';

@Module({imports:[AuditModule],controllers:[SyntheticMonitoringController],providers:[SyntheticMonitoringService,SyntheticMonitoringWorker],exports:[SyntheticMonitoringService]})
export class SyntheticMonitoringModule {}
