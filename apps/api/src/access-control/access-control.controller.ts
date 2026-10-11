import { Body, Controller, Delete, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SetPermissionOverrideDto } from './access-control.dto';
import { AccessControlService } from './access-control.service';

@Controller('access-control')
@UseGuards(AuthGuard,RolesGuard)
export class AccessControlController {
  constructor(private readonly access:AccessControlService){}
  @Get() @Roles('OWNER','ADMIN')
  list(@Req() req:AuthenticatedRequest){return this.access.list(req.user!.tenantId);}
  @Put('roles/:role/permissions/:permissionKey') @Roles('OWNER')
  setRole(@Req() req:AuthenticatedRequest,@Param('role') role:string,@Param('permissionKey') permissionKey:string,@Body() dto:SetPermissionOverrideDto){
    return this.access.setRolePermission(req.user!.tenantId,req.user!.id,role,permissionKey,dto.allowed,{userId:req.user!.id,requestId:req.requestId,ipAddress:req.ip});
  }
  @Delete('roles/:role/permissions/:permissionKey') @Roles('OWNER')
  clearRole(@Req() req:AuthenticatedRequest,@Param('role') role:string,@Param('permissionKey') permissionKey:string){
    return this.access.clearRolePermission(req.user!.tenantId,req.user!.id,role,permissionKey,{userId:req.user!.id,requestId:req.requestId,ipAddress:req.ip});
  }
  @Put('users/:userId/permissions/:permissionKey') @Roles('OWNER')
  setUser(@Req() req:AuthenticatedRequest,@Param('userId') userId:string,@Param('permissionKey') permissionKey:string,@Body() dto:SetPermissionOverrideDto){
    return this.access.setUserPermission(req.user!.tenantId,req.user!.id,userId,permissionKey,dto.allowed,{userId:req.user!.id,requestId:req.requestId,ipAddress:req.ip});
  }
  @Delete('users/:userId/permissions/:permissionKey') @Roles('OWNER')
  clearUser(@Req() req:AuthenticatedRequest,@Param('userId') userId:string,@Param('permissionKey') permissionKey:string){
    return this.access.clearUserPermission(req.user!.tenantId,req.user!.id,userId,permissionKey,{userId:req.user!.id,requestId:req.requestId,ipAddress:req.ip});
  }
}
