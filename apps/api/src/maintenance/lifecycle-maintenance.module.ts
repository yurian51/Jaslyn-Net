import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../database/database.module';
import { RoutersModule } from '../routers/routers.module';
import { SessionsModule } from '../sessions/sessions.module';
import { LifecycleMaintenanceService } from './lifecycle-maintenance.service';

@Module({
  imports: [DatabaseModule, AuditModule, RoutersModule, SessionsModule],
  providers: [LifecycleMaintenanceService],
})
export class LifecycleMaintenanceModule {}
