/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated the Redis client provider and lifecycle.
 * Author review: Read in full; the service starts and connects under docker compose.
 */
import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { config } from '../config';

export const REDIS = Symbol('REDIS');

/**
 * Everything kept here expires: OTPs after 5 minutes, lockouts after 15, rate windows after
 * 10. Expiry is native in Redis; in Postgres it would be a timestamp column plus a cleanup
 * job. Nothing that must survive is stored here — if Redis is lost, counters reset and
 * in-flight OTPs are dropped, and users simply retry (AGENTS.md, "Why PostgreSQL and Redis").
 */
@Injectable()
export class RedisLifecycle implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Redis');

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onModuleInit() {
    await this.redis.ping();
    this.logger.log('Redis ready');
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: () =>
        new Redis(config.redisUrl, {
          // Fail fast at startup rather than queueing commands against a dead server.
          maxRetriesPerRequest: 3,
          lazyConnect: false,
        }),
    },
    RedisLifecycle,
  ],
  exports: [REDIS],
})
export class RedisModule {}
