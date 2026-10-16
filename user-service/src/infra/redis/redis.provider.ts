/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from the REDIS provider in user-service/src/redis/redis.module.ts (original disclosure: Claude Code, Claude Opus 5, 2026-09-25); reads the URL from ConfigService.
 * Author review: Successfully reviewed by Deanson, 2026-10-16.
 */
// AI-generated (reviewed by Deanson)
import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { AppConfig } from '../../config/env.validation';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/** The raw client. Only RedisService injects it; it is never exported. */
export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService<AppConfig, true>) =>
    // Fail fast rather than queue commands against a dead server.
    new Redis(config.get('redisUrl', { infer: true }), { maxRetriesPerRequest: 3 }),
};
