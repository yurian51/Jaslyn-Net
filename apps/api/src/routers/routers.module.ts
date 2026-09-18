import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SecureNetworkCredentials } from '../common/secure-network-credentials';
import { TrafficModule } from '../modules/traffic/traffic.module';
import { NetworkCapabilitiesController } from './network-capabilities.controller';
import { RoutersController } from './routers.controller';
import { NetworkEnforcementService } from './network-enforcement.service';
import { RoutersService } from './routers.service';

@Module({
  imports: [AuditModule, TrafficModule],
  controllers: [RoutersController, NetworkCapabilitiesController],
  providers: [SecureNetworkCredentials, NetworkEnforcementService, RoutersService],
  exports: [RoutersService, SecureNetworkCredentials, NetworkEnforcementService],
})
export class RoutersModule {}
