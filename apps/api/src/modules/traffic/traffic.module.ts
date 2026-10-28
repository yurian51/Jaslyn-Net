import { Module } from '@nestjs/common';
import { SecureNetworkCredentials } from '../../common/secure-network-credentials';
import { AuditModule } from '../../audit/audit.module';
import { RadiusModule } from '../../radius/radius.module';
import { FairnessService } from './fairness.service';
import { TrafficEnforcementService } from './enforcement.service';
import { MikroTikTrafficEnforcementAdapter } from './mikrotik.adapter';
import { MerakiTrafficEnforcementAdapter } from './meraki.adapter';
import { OmadaNetworkAdapter } from './omada.adapter';
import { RuijieReyeeNetworkAdapter } from './ruijie.adapter';
import { ArubaCentralNetworkAdapter } from './aruba-central.adapter';
import {
  CambiumCnMaestroNetworkAdapter,
  GrandstreamGwnNetworkAdapter,
  PeplinkInControlNetworkAdapter,
  PfSenseOpnSenseNetworkAdapter,
  RuckusSmartZoneNetworkAdapter,
  TeltonikaRmsNetworkAdapter,
} from './additional-vendor.adapters';
import { NetworkDeviceAdapterRegistry } from './network-device.adapter';
import { MikroTikCapabilityAdapter, OpenWrtCapabilityAdapter, FreeRadiusCapabilityAdapter, NetworkCapabilityRegistry } from './network-capability-fabric';
import { TrafficSamplesController } from './traffic-samples.controller';
import { TrafficSamplesService } from './traffic-samples.service';
import { TrafficOrchestratorService } from './traffic-orchestrator.service';
import { TrafficOrchestratorController } from './traffic-orchestrator.controller';
import { TrafficCollectorService } from './traffic-collector.service';
import { NetworkCommandService } from './network-command.service';
import { NetworkCommandController } from './network-command.controller';
import { NetworkCommandWorkerService } from './network-command-worker.service';
import { LoadBalancingController } from './load-balancing.controller';
import { LoadBalancingService } from './load-balancing.service';
import { LoadBalancingEngine } from './load-balancing.engine';

@Module({
  imports: [AuditModule, RadiusModule],
  controllers: [TrafficSamplesController, TrafficOrchestratorController, NetworkCommandController, LoadBalancingController],
  providers: [
    SecureNetworkCredentials,
    FairnessService,
    TrafficSamplesService,
    NetworkCommandService,
    MikroTikTrafficEnforcementAdapter,
    MerakiTrafficEnforcementAdapter,
    OmadaNetworkAdapter,
    RuijieReyeeNetworkAdapter,
    ArubaCentralNetworkAdapter,
    CambiumCnMaestroNetworkAdapter,
    GrandstreamGwnNetworkAdapter,
    RuckusSmartZoneNetworkAdapter,
    TeltonikaRmsNetworkAdapter,
    PeplinkInControlNetworkAdapter,
    PfSenseOpnSenseNetworkAdapter,
    NetworkDeviceAdapterRegistry,
    MikroTikCapabilityAdapter,
    OpenWrtCapabilityAdapter,
    FreeRadiusCapabilityAdapter,
    NetworkCapabilityRegistry,
    {
      provide: TrafficEnforcementService,
      useFactory: (
        fairnessService: FairnessService,
        mikrotik: MikroTikTrafficEnforcementAdapter,
        meraki: MerakiTrafficEnforcementAdapter,
        aruba: ArubaCentralNetworkAdapter,
        networkCommands: NetworkCommandService,
      ) => new TrafficEnforcementService(fairnessService, {
        MIKROTIK_REST: mikrotik,
        MERAKI_DASHBOARD_API: meraki,
        ARUBA_CENTRAL_API: aruba,
      }, networkCommands),
      inject: [FairnessService, MikroTikTrafficEnforcementAdapter, MerakiTrafficEnforcementAdapter, ArubaCentralNetworkAdapter, NetworkCommandService],
    },
    TrafficOrchestratorService,
    TrafficCollectorService,
    NetworkCommandWorkerService,
    LoadBalancingEngine,
    LoadBalancingService,
  ],
  exports: [FairnessService, TrafficEnforcementService, TrafficSamplesService, TrafficOrchestratorService, NetworkDeviceAdapterRegistry, NetworkCapabilityRegistry, NetworkCommandService, LoadBalancingService],
})
export class TrafficModule {}
