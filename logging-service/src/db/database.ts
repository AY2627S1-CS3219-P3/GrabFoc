/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Copied verbatim from supplier-service/src/db/database.ts (this repository has no shared
 *        package, so common code is copied, not imported).
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-23
 * Scope: Listen for the pool's error event, as credit-service/src/db/database.ts does
 *        (PR #129 review).
 * Author review: Cole Lin, read and approved.
 */
import { Global, Inject, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { config } from '../config';
import { SCHEMA_SQL } from './schema';

// AI-generated (reviewed by Cole Lin).

export const PG_POOL = Symbol('PG_POOL');

// AI-generated (reviewed by Cole Lin).
function createPool(): Pool {
  const pool = new Pool({ connectionString: config.databaseUrl });
  // When PostgreSQL restarts it ends the pool's idle connections and the pool emits 'error'.
  // Without a listener Node treats it as uncaught and the process exits - taking ingest and the
  // query API down over a routine restart, which this Compose setup has no restart policy to undo.
  // The pool replaces the connection itself. Same as credit-service (PR #129 review).
  pool.on('error', (err) => new Logger('Database').error(`Idle database connection lost: ${err.message}`));
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
    { provide: PG_POOL, useFactory: createPool },
    DatabaseLifecycle,
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
