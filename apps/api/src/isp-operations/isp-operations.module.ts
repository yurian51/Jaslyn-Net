import { Module } from '@nestjs/common';
import { IspOperationsController } from './isp-operations.controller';
import { FiberLinesService } from './fiber-lines.service';
import { IspOperationsService } from './isp-operations.service';

@Module({
  controllers: [IspOperationsController],
  providers: [IspOperationsService, FiberLinesService],
  exports: [IspOperationsService, FiberLinesService],
})
export class IspOperationsModule {}
