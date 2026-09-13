import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NetworkCapabilitiesController } from './network-capabilities.controller';
import { RoutersController } from './routers.controller';
import { RoutersService } from './routers.service';

@Module({
  imports: [AuditModule],
  controllers: [RoutersController, NetworkCapabilitiesController],
  providers: [RoutersService],
  exports: [RoutersService],
})
export class RoutersModule {}
