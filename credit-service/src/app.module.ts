/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
 * Scope: Generated the NestJS module wiring (database, credit routes).
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Registered the balance controller.
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Registered the Kafka connection, topics and consumer; Phase 3: the dead-letter service and routes.
 * Author review: pending — Jian Bing to record what he checked.
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
