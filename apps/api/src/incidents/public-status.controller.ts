import { Controller, Get, Header, Param } from '@nestjs/common';
import { IncidentsService } from './incidents.service';

@Controller('public/status')
export class PublicStatusController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get(':slug')
  @Header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
  getStatus(@Param('slug') slug: string) {
    return this.incidents.getPublicStatus(slug);
  }
}
