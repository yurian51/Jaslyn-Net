import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateTenantSecretDto } from './secrets-vault.dto';
import { SecretsVaultService } from './secrets-vault.service';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';

@Controller('secrets-vault')
@UseGuards(AuthGuard,RolesGuard,PermissionsGuard)
export class SecretsVaultController {
  constructor(private readonly secrets:SecretsVaultService){}
  @Get() @Roles('OWNER','ADMIN') @Permissions('secrets.read')
  list(@Req() req:AuthenticatedRequest){return this.secrets.list(req.user!.tenantId);}
  @Post() @Roles('OWNER','ADMIN') @Permissions('secrets.write')
  create(@Req() req:AuthenticatedRequest,@Body() dto:CreateTenantSecretDto){
    return this.secrets.create(req.user!.tenantId,req.user!.id,dto,{userId:req.user!.id,requestId:req.requestId,ipAddress:req.ip});
  }
  @Post('rotate') @Roles('OWNER','ADMIN') @Permissions('secrets.write')
  rotateAll(@Req() req:AuthenticatedRequest){return this.secrets.rotateAll(req.user!.tenantId,req.user!.id,{userId:req.user!.id,requestId:req.requestId,ipAddress:req.ip});}
  @Post(':id/rotate') @Roles('OWNER','ADMIN') @Permissions('secrets.write')
  rotateOne(@Req() req:AuthenticatedRequest,@Param('id') id:string){return this.secrets.rotateOne(req.user!.tenantId,req.user!.id,id,{userId:req.user!.id,requestId:req.requestId,ipAddress:req.ip});}
}
