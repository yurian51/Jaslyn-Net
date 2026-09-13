import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RoutersController } from './routers.controller';
import { RoutersService } from './routers.service';

@Module({
  imports: [AuditModule],
  controllers: [RoutersController],
  providers: [RoutersService],
  exports: [RoutersService],
})
export class RoutersModule {}
