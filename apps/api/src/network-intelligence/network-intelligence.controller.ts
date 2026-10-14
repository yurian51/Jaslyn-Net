import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { NetworkIntelligenceService } from './network-intelligence.service';

@Controller('network-intelligence')
@UseGuards(AuthGuard, RolesGuard)
export class NetworkIntelligenceController {
  constructor(private readonly service: NetworkIntelligenceService) {}

  @Get('topology')
  @Roles('OWNER','ADMIN','AGENT','READ_ONLY')
  topology(@Req() req: AuthenticatedRequest) { return this.service.topology(req.user!.tenantId); }

  @Get('capacity')
  @Roles('OWNER','ADMIN','AGENT','READ_ONLY')
  capacity(@Req() req: AuthenticatedRequest) { return this.service.capacity(req.user!.tenantId); }

  @Get('routers/:routerId/config-versions')
  @Roles('OWNER','ADMIN','AGENT','READ_ONLY')
  versions(@Req() req: AuthenticatedRequest, @Param('routerId') routerId: string) { return this.service.listVersions(req.user!.tenantId,routerId); }

  @Post('routers/:routerId/config-versions')
  @Roles('OWNER','ADMIN','AGENT')
  createVersion(@Req() req: AuthenticatedRequest, @Param('routerId') routerId: string, @Body() body: { configuration?: unknown; source?: string; changeSummary?: string }) {
    return this.service.createVersion(req.user!.tenantId,req.user!.id,routerId,body,{requestId:req.requestId,ipAddress:req.ip});
  }

  @Get('routers/:routerId/config-diff')
  @Roles('OWNER','ADMIN','AGENT','READ_ONLY')
  diff(@Req() req: AuthenticatedRequest,@Param('routerId') routerId: string,@Query('from') from: string,@Query('to') to: string) {
    return this.service.diff(req.user!.tenantId,routerId,from,to);
  }

  @Post('routers/:routerId/config-versions/:versionId/restore')
  @Roles('OWNER','ADMIN')
  requestRestore(@Req() req: AuthenticatedRequest,@Param('routerId') routerId: string,@Param('versionId') versionId: string) {
    return this.service.requestRestore(req.user!.tenantId,req.user!.id,routerId,versionId,{requestId:req.requestId,ipAddress:req.ip});
  }
}
