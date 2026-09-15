import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RoutersModule } from '../routers/routers.module';
import { TrafficModule } from '../modules/traffic/traffic.module';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [AuditModule, RoutersModule, TrafficModule],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
