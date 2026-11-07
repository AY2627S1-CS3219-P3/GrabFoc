/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
 * Scope: Generated the scaffold's module (#149).
 * Author review: pending — Jie Yang to record the review.
 */
import { Module } from '@nestjs/common';
import { DatabaseModule } from './db/database';
import { HealthController } from './health/health.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
})
export class AppModule {}
