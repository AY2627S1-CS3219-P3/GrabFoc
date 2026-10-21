/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: New module wiring for the restructure (replaces DatabaseModule, RedisModule and OtpModule in user-service/src).
 * Author review: Successfully reviewed by Deanson, 2026-10-16.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
 * Scope: Registered OutboxRepository (exported), KafkaProducer and OutboxRelay.
 * Author review: pending — Deanson to record what he checked.
 */
// AI-generated (reviewed by Deanson)
import { Global, Module } from '@nestjs/common';
import { DatabaseLifecycle } from './database/database.lifecycle';
import { DatabaseService } from './database/database.service';
import { pgPoolProvider } from './database/pg-pool.provider';
import { KafkaProducer } from './kafka/kafka.producer';
import { MailService } from './mail/mail.service';
import { OutboxRelay } from './outbox/outbox.relay';
import { OutboxRepository } from './outbox/outbox.repository';
import { redisProvider } from './redis/redis.provider';
import { RedisService } from './redis/redis.service';

/**
 * Global, so every feature module can inject the services it exports. The raw pool, Redis
 * client and Kafka producer are deliberately not exported: all access goes through these
 * services, and only the outbox relay talks to Kafka.
 */
@Global()
@Module({
  providers: [
    pgPoolProvider,
    DatabaseService,
    DatabaseLifecycle,
    redisProvider,
    RedisService,
    MailService,
    OutboxRepository,
    KafkaProducer,
    OutboxRelay,
  ],
  exports: [DatabaseService, RedisService, MailService, OutboxRepository],
})
export class InfraModule {}
