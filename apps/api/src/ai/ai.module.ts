import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({ imports: [AuditModule], controllers: [AiController], providers: [AiService], exports: [AiService] })
export class AiModule {}