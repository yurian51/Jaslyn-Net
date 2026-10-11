import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CreateTenantRelationshipDto } from './procurement.dto';
import { TenantHierarchyService } from './tenant-hierarchy.service';

@Controller('msp/hierarchy')
@UseGuards(AuthGuard,RolesGuard,PermissionsGuard)
export class TenantHierarchyController {
  constructor(private readonly hierarchy:TenantHierarchyService){}
  @Get() @Roles('OWNER','ADMIN') @Permissions('msp.hierarchy.read')
  list(@Req() r:AuthenticatedRequest){return this.hierarchy.list(r.user!.tenantId);}
  @Post('request') @Roles('OWNER','ADMIN') @Permissions('msp.hierarchy.manage')
  request(@Req() r:AuthenticatedRequest,@Body() d:CreateTenantRelationshipDto){return this.hierarchy.request(r.user!.tenantId,r.user!.id,d);}
  @Post(':childTenantId/approve') @Roles('OWNER','ADMIN') @Permissions('msp.hierarchy.manage')
  approve(@Req() r:AuthenticatedRequest,@Param('childTenantId') childTenantId:string){return this.hierarchy.approve(r.user!.tenantId,r.user!.id,childTenantId);}
}
