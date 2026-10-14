import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TrafficModule } from '../modules/traffic/traffic.module';
import { NetworkAutoHealingController } from './network-auto-healing.controller';
import { NetworkAutoHealingService } from './network-auto-healing.service';

@Module({imports:[AuditModule,TrafficModule],controllers:[NetworkAutoHealingController],providers:[NetworkAutoHealingService],exports:[NetworkAutoHealingService]})
export class NetworkAutoHealingModule {}
