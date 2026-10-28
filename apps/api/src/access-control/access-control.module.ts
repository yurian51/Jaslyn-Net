import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PermissionsGuard } from '../auth/permissions.guard';
import { AccessControlController } from './access-control.controller';
import { AccessControlService } from './access-control.service';

@Global()
@Module({imports:[AuditModule],controllers:[AccessControlController],providers:[AccessControlService,PermissionsGuard],exports:[AccessControlService,PermissionsGuard]})
export class AccessControlModule {}
