import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UpdateUpesiLipaSiteDto } from './upesilipa.dto';
import { UpesiLipaService } from './upesilipa.service';

@Controller('upesilipa')
@UseGuards(AuthGuard, RolesGuard)
export class UpesiLipaController {
  constructor(private readonly upesilipa: UpesiLipaService) {}

  @Get('capabilities')
  capabilities() { return this.upesilipa.capabilities(); }

  @Get('dashboard')
  dashboard(@Req() req: AuthenticatedRequest) { return this.upesilipa.dashboard(req.user!.tenantId); }

  @Get('sites/:locationId')
  site(@Req() req: AuthenticatedRequest, @Param('locationId') locationId: string) {
    return this.upesilipa.getSiteSettings(req.user!.tenantId, locationId);
  }

  @Patch('sites/:locationId')
  @Roles('OWNER', 'ADMIN')
  updateSite(@Req() req: AuthenticatedRequest, @Param('locationId') locationId: string, @Body() dto: UpdateUpesiLipaSiteDto) {
    return this.upesilipa.updateSiteSettings(req.user!.tenantId, locationId, dto, req.user!.id);
  }

  @Get('sites/:locationId/health')
  health(@Req() req: AuthenticatedRequest, @Param('locationId') locationId: string) {
    return this.upesilipa.siteHealth(req.user!.tenantId, locationId);
  }
}
