/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from withTransaction in user-service/src/db/database.ts (original disclosure: Claude Code, Claude Opus 5, 2026-09-25), as an injectable service with query().
 * Author review: Pending Deanson's review.
 */
// AI-generated (review pending: Deanson)
import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { PG_POOL } from './pg-pool.provider';

/**
 * The only way the rest of the service reaches PostgreSQL. Repositories pass `tx` to run a
 * statement inside a caller's transaction; without it the statement runs on the pool.
 */
@Injectable()
export class DatabaseService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
    tx?: PoolClient,
  ): Promise<QueryResult<T>> {
    return (tx ?? this.pool).query<T>(sql, params);
  }

  /**
   * Runs `fn` in one transaction on a single checked-out client, and always releases it.
   * Anything that reads and writes together (e.g. `SELECT ... FOR UPDATE`) must use this.
   */
  async transaction<T>(fn: (tx: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
