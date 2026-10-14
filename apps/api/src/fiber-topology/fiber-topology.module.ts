import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FiberTopologyController } from './fiber-topology.controller';
import { FiberTopologyService } from './fiber-topology.service';

@Module({ imports:[AuditModule], controllers:[FiberTopologyController], providers:[FiberTopologyService], exports:[FiberTopologyService] })
export class FiberTopologyModule {}
