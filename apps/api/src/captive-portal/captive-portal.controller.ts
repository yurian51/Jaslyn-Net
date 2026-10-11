import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UpdateCaptivePortalSettingsDto } from './captive-portal.dto';
import { CaptivePortalService } from './captive-portal.service';

@Controller()
export class CaptivePortalController {
  constructor(private readonly portal: CaptivePortalService) {}

  @Get('public/captive-portal/:slug')
  getPublicPortal(@Param('slug') slug: string) { return this.portal.getPublicPortal(slug); }

  @Get('captive-portal/settings')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  getSettings(@Req() req: AuthenticatedRequest) {
    return this.portal.getSettings(req.user!.tenantId);
  }

  @Put('captive-portal/settings')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  updateSettings(@Req() req: AuthenticatedRequest, @Body() body: UpdateCaptivePortalSettingsDto) {
    return this.portal.updateSettings(req.user!.tenantId, req.user!.id, body);
  }
}
