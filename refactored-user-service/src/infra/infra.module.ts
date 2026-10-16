/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: New module wiring for the restructure (replaces DatabaseModule, RedisModule and OtpModule in user-service/src).
 * Author review: Pending Deanson's review.
 */
// AI-generated (review pending: Deanson)
import { Global, Module } from '@nestjs/common';
import { DatabaseLifecycle } from './database/database.lifecycle';
import { DatabaseService } from './database/database.service';
import { pgPoolProvider } from './database/pg-pool.provider';
import { MailService } from './mail/mail.service';
import { redisProvider } from './redis/redis.provider';
import { RedisService } from './redis/redis.service';

/**
 * Global, so every feature module can inject the three services. The raw pool and Redis
 * client are deliberately not exported: all access goes through these services.
 */
@Global()
@Module({
  providers: [pgPoolProvider, DatabaseService, DatabaseLifecycle, redisProvider, RedisService, MailService],
  exports: [DatabaseService, RedisService, MailService],
})
export class InfraModule {}
