import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CreateNetworkTelemetryDto, CreatePowerSampleDto, CreateSlaPolicyDto, CreateWifiExperienceDto, UpsertDeviceLifecycleDto } from './operations-intelligence.dto';
import { OperationsIntelligenceService } from './operations-intelligence.service';

@Controller()
@UseGuards(AuthGuard,RolesGuard,PermissionsGuard)
export class OperationsIntelligenceController {
  constructor(private readonly operations:OperationsIntelligenceService){}
  @Post('operations-intelligence/telemetry') @Roles('OWNER','ADMIN','AGENT') @Permissions('network.experience.ingest')
  ingestTelemetry(@Req() r:AuthenticatedRequest,@Body() d:CreateNetworkTelemetryDto){return this.operations.ingestNetworkSample(r.user!.tenantId,d);}
  @Get('network-experience/wifi') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('network.experience.read')
  wifiExperience(@Req() r:AuthenticatedRequest){return this.operations.wifiExperience(r.user!.tenantId);}
  @Post('network-experience/wifi') @Roles('OWNER','ADMIN','AGENT') @Permissions('network.experience.ingest')
  ingestWifi(@Req() r:AuthenticatedRequest,@Body() d:CreateWifiExperienceDto){return this.operations.ingestWifiSample(r.user!.tenantId,d);}
  @Get('network-capacity/forecast') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('network.capacity.read')
  capacity(@Req() r:AuthenticatedRequest){return this.operations.capacityForecast(r.user!.tenantId);}
  @Get('power/status') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('power.read')
  powerStatus(@Req() r:AuthenticatedRequest){return this.operations.powerStatus(r.user!.tenantId);}
  @Post('power/samples') @Roles('OWNER','ADMIN','AGENT') @Permissions('power.ingest')
  ingestPower(@Req() r:AuthenticatedRequest,@Body() d:CreatePowerSampleDto){return this.operations.ingestPowerSample(r.user!.tenantId,d);}
  @Get('device-lifecycle') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('device.lifecycle.read')
  lifecycle(@Req() r:AuthenticatedRequest){return this.operations.listLifecycle(r.user!.tenantId);}
  @Post('device-lifecycle') @Roles('OWNER','ADMIN') @Permissions('device.lifecycle.manage')
  upsertLifecycle(@Req() r:AuthenticatedRequest,@Body() d:UpsertDeviceLifecycleDto){return this.operations.upsertLifecycle(r.user!.tenantId,r.user!.id,d);}
  @Get('service-sla/policies') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('sla.read')
  slaPolicies(@Req() r:AuthenticatedRequest){return this.operations.listSlaPolicies(r.user!.tenantId);}
  @Post('service-sla/policies') @Roles('OWNER','ADMIN') @Permissions('sla.manage')
  createSlaPolicy(@Req() r:AuthenticatedRequest,@Body() d:CreateSlaPolicyDto){return this.operations.createSlaPolicy(r.user!.tenantId,r.user!.id,d);}
}
