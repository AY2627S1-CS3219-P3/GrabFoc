/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Moved the Redis calls out of user-service/src/otp/otp.service.ts, auth/lockout.service.ts
 *   and the RedisLifecycle in redis/redis.module.ts (original disclosures: Claude Code, Claude Opus 5,
 *   2026-09-25/26). Returns plain results; the callers decide which HTTP error each one means.
 * Author review: Successfully reviewed by Deanson, 2026-10-16.
 */
// AI-generated (reviewed by Deanson)
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { LOGIN_LIMIT, Limit, OTP_MAX_ATTEMPTS, OTP_REQUEST_LIMIT, loginKeys, otpRequestKeys } from './redis.constants';
import { REDIS_CLIENT } from './redis.provider';
import { HIT_LIMIT, REPLACE_OTP_CODE, VERIFY_OTP } from './redis.scripts';

/**
 * Every OTP record has this shape. `data` is whatever travels with the code: a pending sign-up,
 * or the encrypted new email for NEW_EMAIL_VERIFY. Only the HMAC of the code is stored.
 */
export interface OtpRecord<T = unknown> {
  otpHash: string;
  attempts: number;
  /** Epoch ms. Checked by VERIFY_OTP, because a record may outlive its code. */
  otpExpiresAt: number;
  data?: T;
}

export type VerifyOtpResult<T> =
  | { status: 'OK'; record: OtpRecord<T> }
  | { status: 'INVALID'; attemptsRemaining: number }
  | { status: 'EXPIRED' };

export interface LimitResult {
  blocked: boolean;
  retryAfterSeconds?: number;
}

/**
 * The only class that touches Redis. Everything here expires, so losing Redis only resets
 * counters and drops in-flight codes (user-service/AGENTS.md, "Why PostgreSQL and Redis").
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Redis');

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleInit() {
    await this.redis.ping();
    this.logger.log('Redis ready');
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  // ---------------------------------------------------------------- OTP records

  /** Writes (or replaces) a record. Replacing is what makes an older code stop working. */
  async saveOtp<T>(key: string, record: OtpRecord<T>, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(record), 'EX', ttlSeconds);
  }

  /**
   * Checks a code. With `consume: false` a match leaves the record in place, for flows that
   * must pass a business check before the code is spent (then call `deleteOtp`).
   */
  async verifyOtp<T>(key: string, otpHash: string, options: { consume: boolean }): Promise<VerifyOtpResult<T>> {
    const [status, attemptsRemaining, raw] = (await this.redis.eval(
      VERIFY_OTP,
      1,
      key,
      otpHash,
      String(OTP_MAX_ATTEMPTS),
      String(Date.now()),
      options.consume ? '1' : '0',
    )) as [string, number, string];

    if (status === 'OK') return { status: 'OK', record: JSON.parse(raw) as OtpRecord<T> };
    if (status === 'INVALID') return { status: 'INVALID', attemptsRemaining };
    return { status: 'EXPIRED' };
  }

  /** Puts a new code into an existing record. False when there is no record to update. */
  async replaceOtpCode(key: string, otpHash: string, expiresAt: number): Promise<boolean> {
    const updated = (await this.redis.eval(REPLACE_OTP_CODE, 1, key, otpHash, String(expiresAt))) as number;
    return updated === 1;
  }

  /** Idempotent: deleting a missing key is a no-op. */
  async deleteOtp(key: string): Promise<void> {
    await this.redis.del(key);
  }

  // ---------------------------------------------------------------- limits

  /** Counts one OTP request for `subject` (3 per 10 minutes, then a 15-minute block). */
  hitOtpRequestLimit(subject: string): Promise<LimitResult> {
    const { counter, block } = otpRequestKeys(subject);
    return this.hitLimit(counter, block, OTP_REQUEST_LIMIT);
  }

  /** Seconds left on a login lock, or 0 (or less) when not locked. */
  getLoginLockTtl(emailHash: string): Promise<number> {
    return this.redis.ttl(loginKeys(emailHash).block);
  }

  /** Counts one failed login; the 5th in 15 minutes locks the address for 15 minutes. */
  async recordLoginFailure(emailHash: string): Promise<{ locked: boolean; retryAfterSeconds?: number }> {
    const { counter, block } = loginKeys(emailHash);
    const result = await this.hitLimit(counter, block, LOGIN_LIMIT);
    return { locked: result.blocked, retryAfterSeconds: result.retryAfterSeconds };
  }

  /**
   * Clears the failure count. `unlock: true` also lifts an active lock: only a password reset
   * does that, because a correct password alone must not cut a lock short.
   */
  async clearLoginFailures(emailHash: string, options: { unlock?: boolean } = {}): Promise<void> {
    const { counter, block } = loginKeys(emailHash);
    await (options.unlock ? this.redis.del(counter, block) : this.redis.del(counter));
  }

  private async hitLimit(counter: string, block: string, limit: Limit): Promise<LimitResult> {
    const [status, seconds] = (await this.redis.eval(
      HIT_LIMIT,
      2,
      counter,
      block,
      String(limit.threshold),
      String(limit.windowSeconds),
      String(limit.blockSeconds),
    )) as [string, number];
    return status === 'BLOCKED' ? { blocked: true, retryAfterSeconds: seconds } : { blocked: false };
  }
}
