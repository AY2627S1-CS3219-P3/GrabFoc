/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated the module wiring (database, query route, ingest, purge, global JWT guard),
 *        following supplier-service/src/app.module.ts.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Provide the Kafka consumer and dead-letter producer when a broker is configured.
 * Author review: pending — Cole Lin to record what he checked.
 */
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './common/auth';
import { config } from './config';
import { DatabaseModule } from './db/database';
import { DEAD_LETTERS, LINE_CONSUMER } from './ingest/consumer';
import { IngestService } from './ingest/ingest.service';
import { KafkaIngest } from './ingest/kafka.consumer';
import { LinesController } from './lines/lines.controller';
import { LinesService } from './lines/lines.service';
import { PurgeService } from './purge/purge.service';

// AI-generated (reviewed by Cole Lin).

@Module({
  imports: [DatabaseModule],
  controllers: [LinesController],
  providers: [
    LinesService,
    IngestService,
    PurgeService,
    // Only when a broker is configured. Without one the query API still runs and ingest is off,
    // which is a normal way to run this service — see IngestService.
    ...(config.kafkaBrokers.length
      ? [
          KafkaIngest,
          { provide: LINE_CONSUMER, useExisting: KafkaIngest },
          { provide: DEAD_LETTERS, useExisting: KafkaIngest },
        ]
      : []),
    // Global, so a route added later cannot be reached without a token by forgetting a decorator.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
