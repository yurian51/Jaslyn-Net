import { Module } from '@nestjs/common';
import { IspOperationsController } from './isp-operations.controller';
import { CustomerServiceStateService } from './customer-service-state.service';
import { FiberLinesService } from './fiber-lines.service';
import { IspExpiryService } from './isp-expiry.service';
import { IspOperationsService } from './isp-operations.service';

@Module({
  controllers: [IspOperationsController],
  providers: [IspOperationsService, FiberLinesService, CustomerServiceStateService, IspExpiryService],
  exports: [IspOperationsService, FiberLinesService, CustomerServiceStateService, IspExpiryService],
})
export class IspOperationsModule {}
