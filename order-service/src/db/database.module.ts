/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated the global PostgreSQL pool provider (Phase A). Migrations stay in the one-shot
 *        order-migrate task, not at server startup.
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
 */
import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { databaseConfig } from './config';

export const PG_POOL = Symbol('PG_POOL');

@Global()
@Module({
  providers: [{ provide: PG_POOL, useFactory: () => new Pool(databaseConfig()) }],
  exports: [PG_POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  onApplicationShutdown() {
    return this.pool.end();
  }
}
