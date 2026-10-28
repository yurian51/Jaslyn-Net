import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UpdateNetworkAutoHealingPolicyDto } from './network-auto-healing.dto';
import { NetworkAutoHealingService } from './network-auto-healing.service';

@Controller('network-auto-healing')
@UseGuards(AuthGuard,RolesGuard)
export class NetworkAutoHealingController {
  constructor(private readonly healing:NetworkAutoHealingService){}
  @Get('policy') @Roles('OWNER','ADMIN','NETWORK_ADMIN','NOC_ENGINEER','READ_ONLY')
  policy(@Req() r:AuthenticatedRequest){return this.healing.getPolicy(r.user!.tenantId);}
  @Put('policy') @Roles('OWNER','ADMIN','NETWORK_ADMIN','NOC_ENGINEER')
  updatePolicy(@Req() r:AuthenticatedRequest,@Body() d:UpdateNetworkAutoHealingPolicyDto){
    return this.healing.updatePolicy(r.user!.tenantId,r.user!.id,d,{userId:r.user!.id,requestId:r.requestId,ipAddress:r.ip});
  }
  @Get('runs') @Roles('OWNER','ADMIN','NETWORK_ADMIN','NOC_ENGINEER','READ_ONLY')
  runs(@Req() r:AuthenticatedRequest){return this.healing.listRuns(r.user!.tenantId);}
}
