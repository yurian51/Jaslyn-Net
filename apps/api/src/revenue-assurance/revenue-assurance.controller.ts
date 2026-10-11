import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RevenueAssuranceService } from './revenue-assurance.service';
import { UpdateRevenueDiscrepancyDto } from './revenue-assurance.dto';

@Controller('revenue-assurance')
@UseGuards(AuthGuard,RolesGuard)
export class RevenueAssuranceController {
  constructor(private readonly assurance:RevenueAssuranceService){}
  @Post('run') @Roles('OWNER','ADMIN')
  run(@Req() req:AuthenticatedRequest){return this.assurance.runReconciliation(req.user!.tenantId,req.user!.id,{userId:req.user!.id,requestId:req.requestId,ipAddress:req.ip});}
  @Get('runs') @Roles('OWNER','ADMIN','AGENT','READ_ONLY')
  runs(@Req() req:AuthenticatedRequest){return this.assurance.listRuns(req.user!.tenantId);}
  @Get('discrepancies') @Roles('OWNER','ADMIN','AGENT','READ_ONLY')
  discrepancies(@Req() req:AuthenticatedRequest,@Query('status') status?:string){return this.assurance.listDiscrepancies(req.user!.tenantId,status);}
  @Patch('discrepancies/:id') @Roles('OWNER','ADMIN')
  update(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() dto:UpdateRevenueDiscrepancyDto){
    return this.assurance.updateDiscrepancy(req.user!.tenantId,req.user!.id,id,dto,{userId:req.user!.id,requestId:req.requestId,ipAddress:req.ip});
  }
}
