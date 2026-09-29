/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-26
 * Scope: Generated the login lockout: the lock check, the failure counter and the reset.
 * Author review: Read in full; `npm run test:int` passes against a real Redis, including the
 *                case where five wrong passwords arrive at once.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppError } from '../common/app-error';
import { ErrorCode } from '../common/error-codes';
import { REDIS } from '../redis/redis.module';
import { RECORD_LOGIN_FAILURE_LUA } from './lockout.scripts';

/**
 * AGENTS.md, "Login" and "Redis keys". Changing any of these changes a documented rule.
 *
 * Five, not three: the root AGENTS.md lists the threshold as an open item between the two and
 * records five as this service's choice.
 */
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_FAIL_WINDOW_SECONDS = 15 * 60;
export const LOGIN_LOCK_SECONDS = 15 * 60;

const failKey = (emailHash: string) => `loginfail:${emailHash}`;
const lockKey = (emailHash: string) => `loginlock:${emailHash}`;

/**
 * Keyed by the **email hash**, never the address, so a locked and an unlocked account are
 * indistinguishable by key inspection, and so an address that has no account is counted
 * exactly like one that does — otherwise "this address never locks out" would itself reveal
 * that no account exists.
 *
 * All of it lives in Redis because all of it expires. Nothing here needs to survive a
 * restart: losing a lockout early is a smaller problem than a cleanup job in Postgres.
 */
@Injectable()
export class LockoutService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /**
   * Step 1 of login: refuse a locked account before looking anything up, so a locked account
   * costs no database query and no bcrypt comparison.
   *
   * Throws 423 with the seconds remaining, taken from the key's own TTL.
   */
  async assertNotLocked(emailHash: string): Promise<void> {
    const seconds = await this.redis.ttl(lockKey(emailHash));
    if (seconds > 0) {
      throw new AppError(423, ErrorCode.ACCOUNT_LOCKED, 'Too many failed attempts.', {
        retryAfterSeconds: seconds,
      });
    }
  }

  /**
   * Step 3: count one failure and produce the error for it. The fifth is 423 and starts the
   * lock; the first four are 401 `INVALID_CREDENTIALS`.
   *
   * It *returns* the error rather than throwing it, so the call site reads
   * `throw await lockout.recordFailure(...)`. A method that only ever threw would be tidier,
   * but TypeScript cannot narrow types across an awaited call it believes may return, so the
   * caller would need a second unreachable throw to convince the compiler.
   */
  async recordFailure(emailHash: string): Promise<AppError> {
    const [status, seconds] = (await this.redis.eval(
      RECORD_LOGIN_FAILURE_LUA,
      2,
      failKey(emailHash),
      lockKey(emailHash),
      String(LOGIN_MAX_FAILURES),
      String(LOGIN_FAIL_WINDOW_SECONDS),
      String(LOGIN_LOCK_SECONDS),
    )) as [string, number];

    if (status === 'LOCKED') {
      return new AppError(423, ErrorCode.ACCOUNT_LOCKED, 'Too many failed attempts.', {
        retryAfterSeconds: seconds,
      });
    }

    // Deliberately says nothing about which half was wrong, or whether the account exists.
    return new AppError(401, ErrorCode.INVALID_CREDENTIALS, 'Email or password is incorrect.');
  }

  /** Step 4: a correct password clears the run of failures, so it takes five *consecutive* ones. */
  async clearFailures(emailHash: string): Promise<void> {
    await this.redis.del(failKey(emailHash));
  }

  /**
   * Lifts a lockout outright, counter and all. Called after a successful password reset.
   *
   * Separate from `clearFailures` because a correct password must **not** cut a lock short: the
   * lock is what stops the guessing, and a guesser who finally guesses right is precisely who
   * should still be locked out. A password reset is different — it proves the caller reads the
   * account's inbox, which no amount of guessing does.
   */
  async clear(emailHash: string): Promise<void> {
    await this.redis.del(failKey(emailHash), lockKey(emailHash));
  }
}
