import { Module } from '@nestjs/common';
import { IspOperationsService } from './isp-operations.service';

@Module({
  providers: [IspOperationsService],
  exports: [IspOperationsService],
})
export class IspOperationsModule {}
