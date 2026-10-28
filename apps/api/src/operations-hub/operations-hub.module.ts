import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OperationsHubController } from './operations-hub.controller';
import { OperationsHubService } from './operations-hub.service';

@Module({ imports: [AuditModule], controllers: [OperationsHubController], providers: [OperationsHubService], exports: [OperationsHubService] })
export class OperationsHubModule {}
