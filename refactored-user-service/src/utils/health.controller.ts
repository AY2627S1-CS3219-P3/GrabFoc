/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from user-service/src/health/health.controller.ts (original disclosure: Claude Code, Claude Opus 5, 2026-09-25); queries through DatabaseService.
 * Author review: Pending Deanson's review.
 */
// AI-generated (review pending: Deanson)
import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { AppError } from '../common/errors/app-error';
import { ErrorCode } from '../common/errors/error-codes';
import { DatabaseService } from '../infra/database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  // Public: compose and the gateway need it before anyone has a token.
  @Public()
  @Get()
  async check() {
    try {
      await this.db.query('SELECT 1');
    } catch {
      throw new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, 'The database is unavailable.');
    }
    return { status: 'ok' };
  }
}
