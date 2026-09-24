import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { WORLDWIDE_NETWORK_CAPABILITIES } from '../modules/traffic/network-capabilities';
import { NetworkAdapterRegistry } from './network-adapter-registry';

@Controller('network-capabilities')
@UseGuards(AuthGuard)
export class NetworkCapabilitiesController {
  constructor(private readonly adapters: NetworkAdapterRegistry) {}

  @Get()
  list() {
    return {
      version: 2,
      generatedAt: new Date().toISOString(),
      adapters: this.adapters.list(),
      vendors: WORLDWIDE_NETWORK_CAPABILITIES.map((vendor) => ({
        ...vendor,
        protocols: vendor.protocols.map((protocol) => ({
          protocol,
          lifecycle: this.adapters.isImplemented(protocol) ? 'IMPLEMENTED' : 'CATALOG_ONLY',
        })),
      })),
    };
  }
}
