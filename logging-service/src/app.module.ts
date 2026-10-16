/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated the module wiring (database, query route, ingest, purge, global JWT guard),
 *        following supplier-service/src/app.module.ts.
 * Author review: pending — Cole Lin to record what he checked.
 */
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './common/auth';
import { DatabaseModule } from './db/database';
import { IngestService } from './ingest/ingest.service';
import { LinesController } from './lines/lines.controller';
import { LinesService } from './lines/lines.service';
import { PurgeService } from './purge/purge.service';

@Module({
  imports: [DatabaseModule],
  controllers: [LinesController],
  providers: [
    LinesService,
    IngestService,
    PurgeService,
    // Global, so a route added later cannot be reached without a token by forgetting a decorator.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
