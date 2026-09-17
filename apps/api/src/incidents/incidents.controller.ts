import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { IncidentsService } from './incidents.service';

class ResolveIncidentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  resolution!: string;
}

class IncidentListQuery {
  @IsOptional()
  @IsIn(['OPEN', 'ACKNOWLEDGED', 'RESOLVED'])
  status?: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
}

@Controller('incidents')
@UseGuards(AuthGuard, RolesGuard)
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'CASHIER', 'AGENT', 'READ_ONLY')
  list(@Req() req: AuthenticatedRequest, @Query() query: IncidentListQuery) {
    return this.incidents.list(req.user!.tenantId, query.status);
  }

  @Get(':id')
  @Roles('OWNER', 'ADMIN', 'CASHIER', 'AGENT', 'READ_ONLY')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.incidents.get(req.user!.tenantId, id);
  }

  @Post('routers/:routerId/sync-offline')
  @Roles('OWNER', 'ADMIN', 'AGENT')
  syncRouterOffline(@Req() req: AuthenticatedRequest, @Param('routerId') routerId: string) {
    return this.incidents.syncRouterOffline(req.user!.tenantId, routerId, { userId: req.user!.id, requestId: req.requestId });
  }

  @Post(':id/acknowledge')
  @Roles('OWNER', 'ADMIN', 'AGENT')
  acknowledge(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.incidents.acknowledge(req.user!.tenantId, id, { userId: req.user!.id, requestId: req.requestId });
  }

  @Post(':id/resolve')
  @Roles('OWNER', 'ADMIN', 'AGENT')
  resolve(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: ResolveIncidentDto) {
    return this.incidents.resolve(req.user!.tenantId, id, dto.resolution, { userId: req.user!.id, requestId: req.requestId });
  }
}
