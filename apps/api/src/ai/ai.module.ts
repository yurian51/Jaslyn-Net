import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RoutersModule } from '../routers/routers.module';
import { SessionsModule } from '../sessions/sessions.module';
import { IspOperationsModule } from '../isp-operations/isp-operations.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { LlamafileProvider } from './llamafile.provider';

@Module({
  imports:[AuditModule,RoutersModule,SessionsModule,IspOperationsModule,IncidentsModule],
  controllers:[AiController],
  providers:[AiService,LlamafileProvider],
  exports:[AiService],
})
export class AiModule {}