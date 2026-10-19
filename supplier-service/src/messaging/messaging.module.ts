/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
 * Scope: Generated the module wiring for the Kafka publisher and the outbox relay (issue #120).
 * Author review: pending — Jie Yang to record what he checked.
 */
import { Module } from '@nestjs/common';
import { config } from '../config';
import { OutboxRelay } from './outbox.relay';
import { KafkaPublisher, PUBLISHER } from './publisher';

@Module({
  providers: [
    {
      provide: PUBLISHER,
      useFactory: () => (config.kafkaBrokers.length ? new KafkaPublisher(config.kafkaBrokers) : null),
    },
    OutboxRelay,
  ],
})
export class MessagingModule {}
