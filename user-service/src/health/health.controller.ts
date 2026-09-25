/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated the health endpoint used by the compose healthcheck.
 * Author review: Read in full; verified the service starts, migrates and serves /health under docker compose.
 */
import { Controller, Get, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { Public } from '../auth/decorators';
import { AppError } from '../common/app-error';
import { ErrorCode } from '../common/error-codes';
import { PG_POOL } from '../db/database';

@Controller('health')
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Unauthenticated on purpose: compose and the gateway need it before anyone has a token. */
  @Public()
  @Get()
  async check() {
    try {
      await this.pool.query('SELECT 1');
    } catch {
      throw new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, 'The database is unavailable.');
    }
    return { status: 'ok' };
  }
}
