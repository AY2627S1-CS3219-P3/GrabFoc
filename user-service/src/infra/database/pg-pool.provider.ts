/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from the PG_POOL provider in user-service/src/db/database.ts (original disclosure: Claude Code, Claude Opus 5, 2026-09-25); reads the URL from ConfigService.
 * Author review: Successfully reviewed by Deanson, 2026-10-16.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
 * Scope: createPool logs an idle connection's 'error' instead of letting it crash the service (#137),
 *        as credit-service/src/db/database.ts does.
 * Author review: pending — Jie Yang to record the review.
 */
// AI-generated (reviewed by Deanson)
import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import type { AppConfig } from '../../config/env.validation';

export const PG_POOL = Symbol('PG_POOL');

const poolLogger = new Logger('Database');

export function createPool(connectionString: string): Pool {
  const pool = new Pool({ connectionString });
  // When PostgreSQL restarts it ends the pool's idle connections and the pool emits 'error'. Without
  // a listener Node throws it and the service exits; the pool replaces the connection by itself.
  pool.on('error', (err) => poolLogger.error(`Idle database connection lost: ${err.message}`));
  return pool;
}

/** The raw pool. Only InfraModule's own providers inject it; it is never exported. */
export const pgPoolProvider: Provider = {
  provide: PG_POOL,
  inject: [ConfigService],
  useFactory: (config: ConfigService<AppConfig, true>) => createPool(config.get('databaseUrl', { infer: true })),
};
