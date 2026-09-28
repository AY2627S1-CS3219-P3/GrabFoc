/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-26
 * Scope: Generated integration tests running the lockout script against a real Redis.
 * Author review: Read in full; `npm run test:int` passes, including the case where five wrong
 *                passwords arrive at the same moment.
 */
import { Redis } from 'ioredis';
import {
  LOGIN_FAIL_WINDOW_SECONDS,
  LOGIN_LOCK_SECONDS,
  LOGIN_MAX_FAILURES,
  LockoutService,
} from './lockout.service';

/**
 * Against the Redis container, not a mock: the point of the Lua script is that Redis runs it
 * atomically, which no in-memory fake reproduces.
 *
 *   docker compose up -d user-redis
 *   npm run test:int
 */
const redis = new Redis(process.env.USER_REDIS_URL!, { maxRetriesPerRequest: 1 });
const lockout = new LockoutService(redis);

const emailHash = () => `test-${Math.random().toString(36).slice(2)}`;
const fail = (hash: string) => lockout.recordFailure(hash);

afterAll(async () => {
  await redis.quit();
});

describe('assertNotLocked', () => {
  it('allows an address that has never failed', async () => {
    await expect(lockout.assertNotLocked(emailHash())).resolves.toBeUndefined();
  });

  it('allows an address with failures but no lock yet', async () => {
    const hash = emailHash();
    for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i++) await fail(hash);

    await expect(lockout.assertNotLocked(hash)).resolves.toBeUndefined();
  });

  it('refuses once locked, with the seconds remaining', async () => {
    const hash = emailHash();
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) await fail(hash);

    const error = await lockout.assertNotLocked(hash).catch((e) => e);
    expect(error.code).toBe('ACCOUNT_LOCKED');
    expect(error.getStatus()).toBe(423);
    expect(error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect(error.details.retryAfterSeconds).toBeLessThanOrEqual(LOGIN_LOCK_SECONDS);
  });
});

describe('recordFailure', () => {
  it('returns 401 for the first four failures', async () => {
    const hash = emailHash();
    for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i++) {
      const error = await fail(hash);
      expect(error.getStatus()).toBe(401);
      expect(error.code).toBe('INVALID_CREDENTIALS');
    }
  });

  it('locks on the fifth and returns 423', async () => {
    const hash = emailHash();
    for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i++) await fail(hash);

    const error = await fail(hash);
    expect(error.getStatus()).toBe(423);
    expect(error.details).toEqual({ retryAfterSeconds: LOGIN_LOCK_SECONDS });
    expect(await redis.ttl(`loginlock:${hash}`)).toBeGreaterThan(LOGIN_LOCK_SECONDS - 5);
  });

  it('names both halves of the credentials, so it reveals neither', async () => {
    const error = await fail(emailHash());

    expect(error.message).toMatch(/email/i);
    expect(error.message).toMatch(/password/i);
    // Nothing that would separate "no such account" from "wrong password".
    expect(error.message).not.toMatch(/not found|no such|does not exist|unregistered|unknown/i);
  });

  it('drops the counter once the lock exists, so the lock governs', async () => {
    const hash = emailHash();
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) await fail(hash);

    expect(await redis.exists(`loginfail:${hash}`)).toBe(0);
  });

  it('gives the counter a window, so an abandoned run of failures expires', async () => {
    const hash = emailHash();
    await fail(hash);

    const ttl = await redis.ttl(`loginfail:${hash}`);
    expect(ttl).toBeGreaterThan(LOGIN_FAIL_WINDOW_SECONDS - 5);
    expect(ttl).toBeLessThanOrEqual(LOGIN_FAIL_WINDOW_SECONDS);
  });

  it('does not slide the window forward on every failure', async () => {
    // Only the first failure sets the expiry. Otherwise someone guessing slowly but steadily
    // would keep the window open indefinitely and never trip the lock.
    const hash = emailHash();
    await fail(hash);
    await redis.expire(`loginfail:${hash}`, 30);

    await fail(hash);

    expect(await redis.ttl(`loginfail:${hash}`)).toBeLessThanOrEqual(30);
  });

  it('counts each address separately', async () => {
    const a = emailHash();
    const b = emailHash();
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) await fail(a);

    await expect(lockout.assertNotLocked(b)).resolves.toBeUndefined();
  });

  it('locks even when every wrong password arrives at the same moment', async () => {
    // The reason this is a Lua script: as separate INCR-then-decide commands, five parallel
    // attempts each read a count below the limit and none of them trips the lock.
    const hash = emailHash();

    const errors = await Promise.all(
      Array.from({ length: LOGIN_MAX_FAILURES }, () => fail(hash)),
    );

    expect(errors.filter((e) => e.getStatus() === 423)).toHaveLength(1);
    await expect(lockout.assertNotLocked(hash)).rejects.toMatchObject({
      code: 'ACCOUNT_LOCKED',
    });
  });
});

describe('clearFailures', () => {
  it('resets the run, so it takes five consecutive failures', async () => {
    const hash = emailHash();
    for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i++) await fail(hash);

    await lockout.clearFailures(hash);
    for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i++) await fail(hash);

    await expect(lockout.assertNotLocked(hash)).resolves.toBeUndefined();
  });

  it('does not lift a lock that has already been set', async () => {
    // A correct password arriving during a lockout must not end it; only the TTL does.
    const hash = emailHash();
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) await fail(hash);

    await lockout.clearFailures(hash);

    await expect(lockout.assertNotLocked(hash)).rejects.toMatchObject({
      code: 'ACCOUNT_LOCKED',
    });
  });
});
