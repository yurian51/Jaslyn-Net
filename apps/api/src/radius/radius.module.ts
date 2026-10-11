import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommunicationModule } from '../communication/communication.module';
import { SecureNetworkCredentials } from '../common/secure-network-credentials';
import { RadiusController } from './radius.controller';
import { RadiusService } from './radius.service';
@Module({imports:[AuditModule,CommunicationModule],controllers:[RadiusController],providers:[SecureNetworkCredentials,RadiusService],exports:[RadiusService]})
export class RadiusModule {}
