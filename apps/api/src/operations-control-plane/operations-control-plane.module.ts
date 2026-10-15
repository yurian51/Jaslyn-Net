import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OperationsControlPlaneController } from './operations-control-plane.controller';
import { OperationsControlPlaneService } from './operations-control-plane.service';

@Module({ imports:[AuditModule], controllers:[OperationsControlPlaneController], providers:[OperationsControlPlaneService], exports:[OperationsControlPlaneService] })
export class OperationsControlPlaneModule {}
