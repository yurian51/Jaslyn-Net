import { Module } from '@nestjs/common';
import { UpesiPayController } from './upesipay.controller';
import { UpesiPayService } from './upesipay.service';

@Module({
  controllers: [UpesiPayController],
  providers: [UpesiPayService],
  exports: [UpesiPayService],
})
export class UpesiPayModule {}
