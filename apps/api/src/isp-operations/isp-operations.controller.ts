import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ChangeAccessStateDto, ChangeCustomerServiceStateDto, CreateAccessBindingDto, CreateFiberLineDto, CreateNetworkJobDto, CreateNetworkSiteDto, ListQueryDto, SetFiberStatusDto, UpdateNetworkJobDto } from './isp-operations.dto';
import { CustomerServiceStateService } from './customer-service-state.service';
import { FiberLinesService } from './fiber-lines.service';
import { IspOperationsService } from './isp-operations.service';

@Controller('isp')
@UseGuards(AuthGuard, RolesGuard)
export class IspOperationsController {
  constructor(private readonly isp:IspOperationsService,private readonly fibers:FiberLinesService,private readonly serviceState:CustomerServiceStateService){}
  @Get('access-bindings') listAccessBindings(@Req() req:AuthenticatedRequest,@Query() query:ListQueryDto){return this.isp.listAccessBindings(req.user!.tenantId,query);}
  @Post('access-bindings') @Roles('OWNER','ADMIN','AGENT') createAccessBinding(@Req() req:AuthenticatedRequest,@Body() dto:CreateAccessBindingDto){return this.isp.createAccessBinding(req.user!.tenantId,dto);}
  @Put('access-bindings/:id/state') @Roles('OWNER','ADMIN','AGENT') changeAccessState(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() dto:ChangeAccessStateDto){return this.isp.changeAccessState(req.user!.tenantId,id,dto);}
  @Get('customers/:customerId/service-state') getCustomerServiceState(@Req() req:AuthenticatedRequest,@Param('customerId') customerId:string){return this.serviceState.get(req.user!.tenantId,customerId);}
  @Put('customers/:customerId/service-state') @Roles('OWNER','ADMIN','AGENT') setCustomerServiceState(@Req() req:AuthenticatedRequest,@Param('customerId') customerId:string,@Body() dto:ChangeCustomerServiceStateDto){return this.serviceState.set(req.user!.tenantId,customerId,dto);}
  @Get('customers/:customerId/service-state/history') serviceStateHistory(@Req() req:AuthenticatedRequest,@Param('customerId') customerId:string){return this.serviceState.history(req.user!.tenantId,customerId);}
  @Get('jobs') listJobs(@Req() req:AuthenticatedRequest,@Query() query:ListQueryDto){return this.isp.listJobs(req.user!.tenantId,query);}
  @Post('jobs') @Roles('OWNER','ADMIN','AGENT') createJob(@Req() req:AuthenticatedRequest,@Body() dto:CreateNetworkJobDto){return this.isp.createJob(req.user!.tenantId,dto,req.user!.id);}
  @Put('jobs/:id') @Roles('OWNER','ADMIN','AGENT') updateJob(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() dto:UpdateNetworkJobDto){return this.isp.updateJob(req.user!.tenantId,id,dto,req.user!.id);}
  @Get('jobs/:id/events') jobEvents(@Req() req:AuthenticatedRequest,@Param('id') id:string){return this.isp.jobEvents(req.user!.tenantId,id);}
  @Get('sites') listSites(@Req() req:AuthenticatedRequest,@Query() query:ListQueryDto){return this.isp.listSites(req.user!.tenantId,query);}
  @Post('sites') @Roles('OWNER','ADMIN','AGENT') createSite(@Req() req:AuthenticatedRequest,@Body() dto:CreateNetworkSiteDto){return this.isp.createSite(req.user!.tenantId,dto);}
  @Get('fiber-lines') listFiberLines(@Req() req:AuthenticatedRequest,@Query() query:ListQueryDto){return this.fibers.list(req.user!.tenantId,query);}
  @Post('fiber-lines') @Roles('OWNER','ADMIN','AGENT') createFiberLine(@Req() req:AuthenticatedRequest,@Body() dto:CreateFiberLineDto){return this.fibers.create(req.user!.tenantId,dto);}
  @Put('fiber-lines/:id/status') @Roles('OWNER','ADMIN','AGENT') setFiberStatus(@Req() req:AuthenticatedRequest,@Param('id') id:string,@Body() dto:SetFiberStatusDto){return this.fibers.setStatus(req.user!.tenantId,id,dto.status);}
}
