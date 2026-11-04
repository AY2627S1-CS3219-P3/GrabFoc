/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
 * Scope: Generated the scaffold's module (#149).
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Registered the order.events consumer and dead-letter recording (#152).
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Registered the email sender, mailer and User client (#153).
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: The topics now include one retry topic per NOTIFICATION_RETRY_DELAYS entry (#154).
 * Author review: pending — Jie Yang to record the review.
 */
import { Module } from '@nestjs/common';
import { config } from './config';
import { DatabaseModule } from './db/database';
import { DeadLettersService } from './dead-letters/dead-letters.service';
import { OrderEventsService } from './events/order-events.service';
import { SenderService } from './events/sender.service';
import { HealthController } from './health/health.controller';
import { Mailer } from './mail/mailer';
import { KafkaConnection } from './messaging/kafka.connection';
import { KafkaRunner } from './messaging/kafka.runner';
import { buildTopics, TOPICS } from './messaging/topics';
import { UserClient } from './users/user.client';

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [
    { provide: TOPICS, useValue: buildTopics(config.retryDelaysMs) },
    KafkaConnection,
    OrderEventsService,
    UserClient,
    Mailer,
    SenderService,
    DeadLettersService,
    KafkaRunner,
  ],
})
export class AppModule {}
