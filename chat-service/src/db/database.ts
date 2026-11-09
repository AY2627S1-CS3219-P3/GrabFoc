/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
 * Scope: Copied from notification-service/src/db/database.ts; schema comes from migrations
 *        (chat-migrate) instead of startup SQL, and BIGINT is parsed as a number.
 * Author review: Reviewed by Deanson, 2026-11-09.
 */
import { Global, Inject, Injectable, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { Pool, types } from 'pg';
import { config } from '../config';

export const PG_POOL = Symbol('PG_POOL');

// pg returns BIGINT (OID 20) as a string, which sorts "10" before "9". Message IDs stay far below
// Number.MAX_SAFE_INTEGER, so a number is safe.
types.setTypeParser(20, (value) => Number(value));

const poolLogger = new Logger('Database');

/** Fails fast when the database can't be reached, instead of hanging. */
export function createPool(connectionString: string): Pool {
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5_000, query_timeout: 10_000 });
  // An idle connection dropped by a database restart emits 'error'; unhandled, it crashes the process.
  pool.on('error', (err) => poolLogger.error(`Idle database connection lost: ${err.message}`));
  return pool;
}

@Injectable()
export class DatabaseLifecycle implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleDestroy() {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [{ provide: PG_POOL, useFactory: () => createPool(config.databaseUrl) }, DatabaseLifecycle],
  exports: [PG_POOL],
})
export class DatabaseModule {}
