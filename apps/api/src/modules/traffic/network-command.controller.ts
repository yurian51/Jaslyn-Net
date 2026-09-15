import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../../auth/auth.guard';
import { NetworkCommandService, NetworkCommandStatus } from './network-command.service';

@Controller('network-commands')
@UseGuards(AuthGuard)
export class NetworkCommandController {
  constructor(private readonly commands: NetworkCommandService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query('routerId') routerId?: string, @Query('status') status?: NetworkCommandStatus, @Query('limit') limit?: string) {
    return this.commands.list(req.user!.tenantId, routerId, status, limit ? Number(limit) : 100);
  }

  @Get(':id')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.commands.get(req.user!.tenantId, id);
  }
}
