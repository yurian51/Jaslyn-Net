import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { IpamController } from './ipam.controller';
import { IpamService } from './ipam.service';

@Module({
  imports: [AuditModule],
  controllers: [IpamController],
  providers: [IpamService],
  exports: [IpamService],
})
export class IpamModule {}
