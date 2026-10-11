/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
 * Scope: Generated the PostgreSQL pool provider and startup schema creation, following
 *        supplier-service/src/db/database.ts.
 * Author review: pending — Jian Bing to record what he checked.
 */
import { Global, Inject, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { config } from '../config';
import { SCHEMA_SQL } from './schema';

export const PG_POOL = Symbol('PG_POOL');

@Injectable()
export class DatabaseLifecycle implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Database');

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit() {
    await this.pool.query(SCHEMA_SQL);
    this.logger.log('Schema ready');
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    { provide: PG_POOL, useFactory: () => new Pool({ connectionString: config.databaseUrl }) },
    DatabaseLifecycle,
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
