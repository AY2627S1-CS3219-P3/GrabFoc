/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-22
 * Scope: Generated the PostgreSQL connection pool provider and startup schema creation.
 * Author review (Cole Lin): Read in full; confirmed the pool connects and the schema is created at startup against a fresh database.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
 * Scope: createPool logs an idle connection's 'error' instead of letting it crash the service (#137),
 *        as credit-service/src/db/database.ts does.
 * Author review: pending — Jie Yang to record the review.
 */
import { Global, Inject, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { config } from '../config';
import { SCHEMA_SQL } from './schema';

export const PG_POOL = Symbol('PG_POOL');

const poolLogger = new Logger('Database');

export function createPool(connectionString: string): Pool {
  const pool = new Pool({ connectionString });
  // When PostgreSQL restarts it ends the pool's idle connections and the pool emits 'error'. Without
  // a listener Node throws it and the service exits; the pool replaces the connection by itself.
  pool.on('error', (err) => poolLogger.error(`Idle database connection lost: ${err.message}`));
  return pool;
}

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
    { provide: PG_POOL, useFactory: () => createPool(config.databaseUrl) },
    DatabaseLifecycle,
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
