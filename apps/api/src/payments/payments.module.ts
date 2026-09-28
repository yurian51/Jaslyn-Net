import { Module } from '@nestjs/common';
import { CommunicationModule } from '../communication/communication.module';
import { AuditModule } from '../audit/audit.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [CommunicationModule, AuditModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
