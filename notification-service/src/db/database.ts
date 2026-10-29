/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
 * Scope: Copied the pool and its lifecycle from credit-service/src/db/database.ts (#149). The schema
 *        comes with #150; until then startup only checks the database answers.
 * Author review: pending — Jie Yang to record the review.
 */
import { Global, Inject, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { config } from '../config';

export const PG_POOL = Symbol('PG_POOL');

const poolLogger = new Logger('Database');

/**
 * Fails fast when the database can't be reached, instead of waiting forever, so a stuck database
 * shows up as an error rather than a hang.
 */
export function createPool(connectionString: string): Pool {
  const pool = new Pool({
    connectionString,
    // Give up on a new connection that gets no answer (e.g. a network partition or failover).
    connectionTimeoutMillis: 5_000,
    // Give up on a query whose connection stops answering mid-way.
    query_timeout: 10_000,
  });
  // When PostgreSQL restarts it ends the pool's idle connections and the pool emits 'error'. Without
  // a listener Node throws it and the service exits; the pool replaces the connection by itself (#137).
  pool.on('error', (err) => poolLogger.error(`Idle database connection lost: ${err.message}`));
  return pool;
}

@Injectable()
export class DatabaseLifecycle implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Database');

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit() {
    await this.pool.query('SELECT 1');
    this.logger.log('Database reachable');
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
