import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../database/database.module';
import { UpesiLipaController } from './upesilipa.controller';
import { UpesiLipaService } from './upesilipa.service';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [UpesiLipaController],
  providers: [UpesiLipaService],
  exports: [UpesiLipaService],
})
export class UpesiLipaModule {}
