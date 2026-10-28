import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RevenueAssuranceController } from './revenue-assurance.controller';
import { RevenueAssuranceService } from './revenue-assurance.service';
import { RevenueAssuranceWorker } from './revenue-assurance.worker';

@Module({imports:[AuditModule],controllers:[RevenueAssuranceController],providers:[RevenueAssuranceService,RevenueAssuranceWorker],exports:[RevenueAssuranceService]})
export class RevenueAssuranceModule {}
