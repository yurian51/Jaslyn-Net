import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateNetworkPolicyDto, UpdateComplianceFindingDto } from './security-posture.dto';
import { SecurityPostureService } from './security-posture.service';

@Controller('network-policies')
@UseGuards(AuthGuard,RolesGuard)
export class NetworkPoliciesController {
  constructor(private readonly posture:SecurityPostureService){}
  @Get() @Roles('OWNER','ADMIN','AGENT','READ_ONLY')
  list(@Req() req:AuthenticatedRequest){return this.posture.listPolicies(req.user!.tenantId);}
  @Post() @Roles('OWNER','ADMIN')
  create(@Req() req:AuthenticatedRequest,@Body() dto:CreateNetworkPolicyDto){
    return this.posture.createPolicy(req.user!.tenantId,req.user!.id,dto,{userId:req.user!.id,requestId:req.requestId,ipAddress:req.ip});
  }
  @Post(':id/evaluate') @Roles('OWNER','ADMIN','AGENT')
  evaluate(@Req() req:AuthenticatedRequest,@Param('id') id:string){
    return this.posture.evaluatePolicy(req.user!.tenantId,id,{userId:req.user!.id,requestId:req.requestId,ipAddress:req.ip});
  }
  @Get(':id/evaluations') @Roles('OWNER','ADMIN','AGENT','READ_ONLY')
  evaluations(@Req() req:AuthenticatedRequest,@Param('id') id:string){return this.posture.listPolicyEvaluations(req.user!.tenantId,id);}
}

@Controller('compliance')
@UseGuards(AuthGuard,RolesGuard)
export class ComplianceController {
  constructor(private readonly posture:SecurityPostureService){}
  @Post('scans') @Roles('OWNER','ADMIN')
  scan(@Req() req:AuthenticatedRequest){return this.posture.runComplianceScan(req.user!.tenantId,req.user!.id,{userId:req.user!.id,requestId:req.requestId,ipAddress:req.ip});}
  @Get('scans') @Roles('OWNER','ADMIN','AGENT','READ_ONLY')
  scans(@Req() req:AuthenticatedRequest){return this.posture.listComplianceScans(req.user!.tenantId);}
  @Get('findings') @Roles('OWNER','ADMIN','AGENT','READ_ONLY')
  findings(@Req() req:AuthenticatedRequest,@Query('status') status?:string){return this.posture.listComplianceFindings(req.user!.tenantId,status);}
  @Patch('findings/:id') @Roles('OWNER','ADMIN')
  updateFinding(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() dto:UpdateComplianceFindingDto){
    return this.posture.updateComplianceFinding(req.user!.tenantId,req.user!.id,id,dto,{userId:req.user!.id,requestId:req.requestId,ipAddress:req.ip});
  }
}
