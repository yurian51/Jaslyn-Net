import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CreateControlRecordDto, CreateTopologyEdgeDto, UpdateControlRecordDto, UpsertTopologyNodeDto } from './operations-control-plane.dto';
import { OperationsControlPlaneService } from './operations-control-plane.service';

@Controller('operations')
@UseGuards(AuthGuard,RolesGuard,PermissionsGuard)
export class OperationsControlPlaneController {
  constructor(private readonly service:OperationsControlPlaneService){}
  @Get('topology') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('network.experience.read')
  topology(@Req() r:AuthenticatedRequest){return this.service.topology(r.user!.tenantId);}
  @Post('topology/nodes') @Roles('OWNER','ADMIN','AGENT') @Permissions('network.experience.ingest')
  upsertNode(@Req() r:AuthenticatedRequest,@Body() d:UpsertTopologyNodeDto){return this.service.upsertNode(r.user!.tenantId,r.user!.id,d);}
  @Post('topology/edges') @Roles('OWNER','ADMIN','AGENT') @Permissions('network.experience.ingest')
  addEdge(@Req() r:AuthenticatedRequest,@Body() d:CreateTopologyEdgeDto){return this.service.addEdge(r.user!.tenantId,r.user!.id,d);}
  @Get('topology/nodes/:id/impact') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('network.experience.read')
  impact(@Req() r:AuthenticatedRequest,@Param('id') id:string){return this.service.affected(r.user!.tenantId,id);}
  @Get('root-cause') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('network.experience.read')
  rootCause(@Req() r:AuthenticatedRequest){return this.service.rootCause(r.user!.tenantId);}
  @Get('sla/summary') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('sla.read')
  slaSummary(@Req() r:AuthenticatedRequest){return this.service.slaSummary(r.user!.tenantId);}
  @Get('control-records') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('field.read')
  list(@Req() r:AuthenticatedRequest,@Query('type') type?:string,@Query('status') status?:string){return this.service.listRecords(r.user!.tenantId,type,status);}
  @Post('control-records') @Roles('OWNER','ADMIN','AGENT') @Permissions('field.write')
  create(@Req() r:AuthenticatedRequest,@Body() d:CreateControlRecordDto){return this.service.createRecord(r.user!.tenantId,r.user!.id,d);}
  @Put('control-records/:id') @Roles('OWNER','ADMIN','AGENT') @Permissions('field.write')
  update(@Req() r:AuthenticatedRequest,@Param('id') id:string,@Body() d:UpdateControlRecordDto){return this.service.updateRecord(r.user!.tenantId,r.user!.id,id,d);}
  @Get('control-records/:id/events') @Roles('OWNER','ADMIN','AGENT','READ_ONLY') @Permissions('field.read')
  events(@Req() r:AuthenticatedRequest,@Param('id') id:string){return this.service.events(r.user!.tenantId,id);}
}
