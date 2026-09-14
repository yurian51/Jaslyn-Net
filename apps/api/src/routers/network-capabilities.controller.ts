import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { WORLDWIDE_NETWORK_CAPABILITIES } from '../modules/traffic/network-capabilities';

@Controller('network-capabilities')
@UseGuards(AuthGuard)
export class NetworkCapabilitiesController {
  @Get()
  list() {
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      vendors: WORLDWIDE_NETWORK_CAPABILITIES,
    };
  }
}
