import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateRadiusNasDto, DisconnectRadiusSessionDto, SetRadiusCredentialDto } from './radius.dto';
import { RadiusService } from './radius.service';

@Controller('radius')
@UseGuards(AuthGuard, RolesGuard)
export class RadiusController {
  constructor(private readonly radius: RadiusService) {}
  @Get('nas') listNas(@Req() req:AuthenticatedRequest){return this.radius.listNas(req.user!.tenantId);}
  @Post('nas') @Roles('OWNER','ADMIN') createNas(@Req() req:AuthenticatedRequest,@Body() dto:CreateRadiusNasDto){return this.radius.createNas(req.user!.tenantId,dto);}
  @Post('disconnect') @Roles('OWNER','ADMIN','AGENT') disconnect(@Req() req:AuthenticatedRequest,@Body() dto:DisconnectRadiusSessionDto){return this.radius.disconnectSession(req.user!.tenantId,dto);}
  @Post('credentials') @Roles('OWNER','ADMIN') setCredential(@Req() req:AuthenticatedRequest,@Body() dto:SetRadiusCredentialDto){return this.radius.setCredential(req.user!.tenantId,dto);}
}
