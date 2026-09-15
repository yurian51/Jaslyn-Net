import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../../auth/auth.guard';
import { NetworkCommandService, NetworkCommandStatus } from './network-command.service';

@Controller('network-commands')
@UseGuards(AuthGuard)
export class NetworkCommandController {
  constructor(private readonly commands: NetworkCommandService) {}

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query('routerId') routerId?: string,
    @Query('status') status?: NetworkCommandStatus,
    @Query('limit') limit?: string,
  ) {
    return this.commands.list(req.user!.tenantId, routerId, status, limit ? Number(limit) : 100);
  }

  @Get(':id')
  async get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const result = await this.commands.list(req.user!.tenantId, undefined, undefined, 500);
    const command = result.data.find((item) => item.id === id);
    return command ?? { error: 'Network command not found' };
  }
}
