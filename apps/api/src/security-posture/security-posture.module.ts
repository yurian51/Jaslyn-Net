import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ComplianceController, NetworkPoliciesController } from './security-posture.controller';
import { SecurityPostureService } from './security-posture.service';
import { ComplianceScanWorker } from './compliance-scan.worker';

@Module({
  imports:[AuditModule],
  controllers:[NetworkPoliciesController,ComplianceController],
  providers:[SecurityPostureService,ComplianceScanWorker],
  exports:[SecurityPostureService],
})
export class SecurityPostureModule {}
