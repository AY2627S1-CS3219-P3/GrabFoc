/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
 * Scope: Generated the NestJS module wiring (database, credit routes).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { Module } from '@nestjs/common';
import { CreditsController } from './credits/credits.controller';
import { CreditsService } from './credits/credits.service';
import { DatabaseModule } from './db/database';

@Module({
  imports: [DatabaseModule],
  controllers: [CreditsController],
  providers: [CreditsService],
})
export class AppModule {}
