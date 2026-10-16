/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from the PG_POOL provider in user-service/src/db/database.ts (original disclosure: Claude Code, Claude Opus 5, 2026-09-25); reads the URL from ConfigService.
 * Author review: Pending Deanson's review.
 */
// AI-generated (review pending: Deanson)
import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import type { AppConfig } from '../../config/env.validation';

export const PG_POOL = Symbol('PG_POOL');

/** The raw pool. Only InfraModule's own providers inject it; it is never exported. */
export const pgPoolProvider: Provider = {
  provide: PG_POOL,
  inject: [ConfigService],
  useFactory: (config: ConfigService<AppConfig, true>) =>
    new Pool({ connectionString: config.get('databaseUrl', { infer: true }) }),
};
