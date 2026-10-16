/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from DatabaseLifecycle in user-service/src/db/database.ts (original disclosure: Claude Code, Claude Opus 5, 2026-09-25).
 * Author review: Pending Deanson's review.
 */
// AI-generated (review pending: Deanson)
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { runMigrations } from './migrator';
import { PG_POOL } from './pg-pool.provider';

/** Applies pending migrations at startup and closes the pool on shutdown. Not exported. */
@Injectable()
export class DatabaseLifecycle implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Database');

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit() {
    await runMigrations(this.pool);
    this.logger.log('Database ready');
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
