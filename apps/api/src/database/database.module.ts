import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { buildDatabaseConfig } from './database.config';

export const PG_POOL = Symbol('PG_POOL');

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new Pool(buildDatabaseConfig({
        DATABASE_URL: config.get<string>('DATABASE_URL'),
        DATABASE_SSL: config.get<string>('DATABASE_SSL'),
        DATABASE_POOL_MAX: config.get<string>('DATABASE_POOL_MAX'),
        DATABASE_IDLE_TIMEOUT_MS: config.get<string>('DATABASE_IDLE_TIMEOUT_MS'),
        DATABASE_CONNECTION_TIMEOUT_MS: config.get<string>('DATABASE_CONNECTION_TIMEOUT_MS'),
        DATABASE_POOL_MAX_USES: config.get<string>('DATABASE_POOL_MAX_USES'),
      })),
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown() {
    await this.pool.end();
  }
}
