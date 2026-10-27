import { Controller, Get } from '@nestjs/common';

@Controller()
export class RootController {
  @Get()
  @Get('/')
  getStatus() {
    return {
      status: 'ok',
      service: 'jaslyn-net-api',
      message: 'API is running. Use /api/v1/health for health checks.',
    };
  }
}
