import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NetworkIntelligenceController } from './network-intelligence.controller';
import { NetworkIntelligenceService } from './network-intelligence.service';

@Module({ imports:[AuditModule],controllers:[NetworkIntelligenceController],providers:[NetworkIntelligenceService] })
export class NetworkIntelligenceModule {}
