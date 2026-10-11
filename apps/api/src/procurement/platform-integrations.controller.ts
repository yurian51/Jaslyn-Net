import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CreatePlatformApiKeyDto, CreateWebhookEndpointDto } from './procurement.dto';
import { PlatformIntegrationsService } from './platform-integrations.service';

@Controller('platform-integrations')
@UseGuards(AuthGuard,RolesGuard,PermissionsGuard)
export class PlatformIntegrationsController {
  constructor(private readonly integrations:PlatformIntegrationsService){}
  @Get('api-keys') @Roles('OWNER','ADMIN') @Permissions('platform.api.manage')
  apiKeys(@Req() r:AuthenticatedRequest){return this.integrations.listApiKeys(r.user!.tenantId);}
  @Post('api-keys') @Roles('OWNER','ADMIN') @Permissions('platform.api.manage')
  createApiKey(@Req() r:AuthenticatedRequest,@Body() d:CreatePlatformApiKeyDto){return this.integrations.createApiKey(r.user!.tenantId,r.user!.id,d);}
  @Post('api-keys/:id/revoke') @Roles('OWNER','ADMIN') @Permissions('platform.api.manage')
  revokeApiKey(@Req() r:AuthenticatedRequest,@Param('id') id:string){return this.integrations.revokeApiKey(r.user!.tenantId,r.user!.id,id);}
  @Get('webhooks') @Roles('OWNER','ADMIN') @Permissions('platform.api.manage')
  webhooks(@Req() r:AuthenticatedRequest){return this.integrations.listWebhooks(r.user!.tenantId);}
  @Post('webhooks') @Roles('OWNER','ADMIN') @Permissions('platform.api.manage')
  createWebhook(@Req() r:AuthenticatedRequest,@Body() d:CreateWebhookEndpointDto){return this.integrations.createWebhook(r.user!.tenantId,r.user!.id,d);}
  @Patch('webhooks/:id/enabled') @Roles('OWNER','ADMIN') @Permissions('platform.api.manage')
  setWebhookEnabled(@Req() r:AuthenticatedRequest,@Param('id') id:string,@Body('enabled') enabled:boolean){
    if(typeof enabled!=='boolean')throw new BadRequestException('enabled must be a boolean');
    return this.integrations.setWebhookEnabled(r.user!.tenantId,r.user!.id,id,enabled);
  }
}
