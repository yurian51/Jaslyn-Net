import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../../auth/auth.guard';
import { RecordTrafficSampleDto } from './traffic-samples.dto';
import { TrafficSamplesService } from './traffic-samples.service';

@Controller('traffic')
@UseGuards(AuthGuard)
export class TrafficSamplesController {
  constructor(private readonly traffic: TrafficSamplesService) {}

  @Post('samples')
  record(@Req() req: AuthenticatedRequest, @Body() dto: RecordTrafficSampleDto) {
    return this.traffic.record(req.user!.tenantId, {
      routerId: dto.routerId,
      customerId: dto.customerId,
      sessionId: dto.sessionId,
      bytesIn: dto.bytesIn,
      bytesOut: dto.bytesOut,
      sampledAt: new Date(dto.sampledAt),
    });
  }

  @Get('sessions/:sessionId/throughput')
  throughput(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string, @Query('at') at?: string) {
    return this.traffic.throughput(req.user!.tenantId, sessionId, at ? new Date(at) : undefined);
  }
}
