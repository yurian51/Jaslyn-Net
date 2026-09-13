import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from '../audit/audit.module';
import { SecureNetworkCredentials } from '../common/secure-network-credentials';
import { NetworkCapabilitiesController } from './network-capabilities.controller';
import { RoutersController } from './routers.controller';
import { RoutersService } from './routers.service';

@Module({
  imports: [AuditModule, ConfigModule],
  controllers: [RoutersController, NetworkCapabilitiesController],
  providers: [SecureNetworkCredentials, RoutersService],
  exports: [RoutersService, SecureNetworkCredentials],
})
export class RoutersModule {}
