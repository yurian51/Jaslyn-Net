import { Module } from '@nestjs/common';
import { IspOperationsController } from './isp-operations.controller';
import { IspOperationsService } from './isp-operations.service';

@Module({
  controllers: [IspOperationsController],
  providers: [IspOperationsService],
  exports: [IspOperationsService],
})
export class IspOperationsModule {}
