/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated the global PostgreSQL pool provider (Phase A). Migrations stay in the one-shot
 *        order-migrate task, not at server startup.
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
 * Scope: createPool logs an idle connection's 'error' instead of letting it crash the service (#137),
 *        as credit-service/src/db/database.ts does.
 * Author review: pending — Jie Yang to record the review.
 */
import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { Pool, PoolConfig } from 'pg';
import { databaseConfig } from './config';

export const PG_POOL = Symbol('PG_POOL');

const poolLogger = new Logger('Database');

export function createPool(config: PoolConfig): Pool {
  const pool = new Pool(config);
  // When PostgreSQL restarts it ends the pool's idle connections and the pool emits 'error'. Without
  // a listener Node throws it and the service exits; the pool replaces the connection by itself.
  pool.on('error', (err) => poolLogger.error(`Idle database connection lost: ${err.message}`));
  return pool;
}

@Global()
@Module({
  providers: [{ provide: PG_POOL, useFactory: () => createPool(databaseConfig()) }],
  exports: [PG_POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  onApplicationShutdown() {
    return this.pool.end();
  }
}
