import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from '../audit/audit.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { SecureNetworkCredentials } from '../common/secure-network-credentials';
import { NetworkCapabilitiesController } from './network-capabilities.controller';
import { RoutersController } from './routers.controller';
import { MikrotikRestAdapter } from './mikrotik-rest.adapter';
import { NetworkEnforcementService } from './network-enforcement.service';
import { RoutersService } from './routers.service';

@Module({
  imports: [AuditModule, ConfigModule, IncidentsModule],
  controllers: [RoutersController, NetworkCapabilitiesController],
  providers: [SecureNetworkCredentials, MikrotikRestAdapter, NetworkEnforcementService, RoutersService],
  exports: [RoutersService, SecureNetworkCredentials, NetworkEnforcementService],
})
export class RoutersModule {}
