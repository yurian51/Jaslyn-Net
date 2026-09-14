import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

@Controller('health')
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  @Get()
  check() {
    return { status: 'ok', service: 'jaslyn-net-api', product: 'JASLYN NET', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async ready() {
    try {
      const result = await this.db.query('select 1 as ok');
      if (result.rows[0]?.ok !== 1) {
        throw new ServiceUnavailableException('Database readiness check failed');
      }
      return {
        status: 'ready',
        service: 'jaslyn-net-api',
        product: 'JASLYN NET',
        database: 'ok',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Database is not ready');
    }
  }
}
