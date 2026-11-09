/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated the module wiring (database, query route, ingest, purge, global JWT guard),
 *        following supplier-service/src/app.module.ts.
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Provided KafkaIngest for both ingest seams when brokers are configured, which is
 *        what turns consuming on at all (issue #52).
 * Author review: Cole Lin, read and approved.
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
    // Only when brokers are configured. KafkaIngest builds its client from config.kafkaBrokers
    // at construction, so providing it with none set would build a client pointed at nothing;
    // IngestService takes both seams as @Optional() precisely so this list can be empty, and
    // then logs that ingest is off and serves the query API.
    //
    // One instance for both tokens, not two: it is one Kafka client, and the dead-letter
    // producer has to be the same connection the consumer is parking from. useExisting, so
    // Nest resolves them to the same provider rather than constructing a second client.
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
