import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SecureNetworkCredentials } from '../common/secure-network-credentials';
import { TrafficModule } from '../modules/traffic/traffic.module';
import { IncidentsService } from '../incidents/incidents.service';
import { CommunicationModule } from '../communication/communication.module';
import { NetworkCapabilitiesController } from './network-capabilities.controller';
import { NetworkAdapterRegistry } from './network-adapter-registry';
import { RoutersController } from './routers.controller';
import { NetworkEnforcementService } from './network-enforcement.service';
import { RoutersService } from './routers.service';
import { NetworkFirmwareInventoryService } from './network-firmware-inventory.service';
import { NetworkFirmwareUpgradeService } from './network-firmware-upgrade.service';
import { MikroTikFirmwareExecutor } from './mikrotik-firmware.executor';
import { MerakiFirmwareExecutor } from './meraki-firmware.executor';
import { MerakiFirmwareService } from './meraki-firmware.service';

@Module({
  imports: [AuditModule, TrafficModule, CommunicationModule],
  controllers: [RoutersController, NetworkCapabilitiesController],
  providers: [SecureNetworkCredentials, IncidentsService, NetworkAdapterRegistry, NetworkEnforcementService, NetworkFirmwareInventoryService, NetworkFirmwareUpgradeService, MikroTikFirmwareExecutor, MerakiFirmwareExecutor, MerakiFirmwareService, RoutersService],
  exports: [RoutersService, SecureNetworkCredentials, NetworkAdapterRegistry, NetworkEnforcementService],
})
export class RoutersModule {}
