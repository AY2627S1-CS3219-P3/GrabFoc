/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
 * Scope: Generated the NestJS module wiring (database, credit routes).
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Registered the balance controller.
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Registered the Kafka connection, topics and consumer; Phase 3: the dead-letter service and routes.
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
 */
import { Module } from '@nestjs/common';
import { config } from './config';
import { BalanceController } from './credits/balance.controller';
import { CreditsController } from './credits/credits.controller';
import { CreditsService } from './credits/credits.service';
import { DatabaseModule } from './db/database';
import { DeadLettersController } from './dead-letters/dead-letters.controller';
import { DeadLettersService } from './dead-letters/dead-letters.service';
import { KafkaConnection } from './messaging/kafka.connection';
import { KafkaRunner } from './messaging/kafka.runner';
import { PUBLISHER } from './messaging/messages';
import { buildTopics, TOPICS } from './messaging/topics';

@Module({
  imports: [DatabaseModule],
  controllers: [CreditsController, BalanceController, DeadLettersController],
  providers: [
    CreditsService,
    DeadLettersService,
    KafkaConnection,
    { provide: PUBLISHER, useExisting: KafkaConnection },
    { provide: TOPICS, useFactory: () => buildTopics(config.retryDelaysMs) },
    KafkaRunner,
  ],
})
export class AppModule {}
