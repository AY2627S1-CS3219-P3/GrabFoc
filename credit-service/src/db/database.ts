/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
 * Scope: Generated the PostgreSQL pool provider and startup schema creation, following
 *        supplier-service/src/db/database.ts.
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Added connection and query timeouts (createPool), from the Phase 2 review.
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Log a lost idle connection instead of crashing (found while manually testing a database
 *        restart).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { Global, Inject, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { config } from '../config';
import { SCHEMA_SQL } from './schema';

export const PG_POOL = Symbol('PG_POOL');

const poolLogger = new Logger('Database');

/**
 * Fails fast when the database can't be reached, instead of waiting forever: the Kafka consumer
 * then pauses and retries the message, rather than stalling until it is evicted from its group.
 */
export function createPool(connectionString: string): Pool {
  const pool = new Pool({
    connectionString,
    // Give up on a new connection that gets no answer (e.g. a network partition or failover).
    connectionTimeoutMillis: 5_000,
    // Give up on a query whose connection stops answering mid-way. Every query here is a
    // single-row read or write, so 10 s only trips on a dead connection.
    query_timeout: 10_000,
  });
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
