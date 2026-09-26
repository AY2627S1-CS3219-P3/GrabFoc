/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated integration tests running the Lua scripts against a real Redis, including
 *        the record variants a pending sign-up uses.
 * Author review: Read in full; `npm run test:int` passes (18 tests against a real Redis), including the concurrency cases the scripts exist for.
 */
import { Redis } from 'ioredis';
import { OtpPurpose } from '../crypto';
import {
  OTP_BLOCK_SECONDS,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_REQUESTS,
  OTP_TTL_SECONDS,
  OtpService,
} from './otp.service';

/**
 * These run against the Redis container, not a mock: the point of the Lua scripts is that
 * Redis executes them atomically, which no in-memory fake reproduces.
 *
 *   docker compose up -d user-redis
 *   npm run test:int
 */
const redis = new Redis(process.env.USER_REDIS_URL!, { maxRetriesPerRequest: 1 });
const otp = new OtpService(redis);

const userId = () => `test-${Math.random().toString(36).slice(2)}`;

afterAll(async () => {
  await redis.quit();
});

describe('issue', () => {
  it('returns a 6-digit code and a 5-minute expiry', async () => {
    const { code, expiresAt } = await otp.issue(OtpPurpose.REGISTRATION, userId());
    expect(code).toMatch(/^\d{6}$/);
    const seconds = Math.round((expiresAt.getTime() - Date.now()) / 1000);
    expect(seconds).toBeGreaterThan(OTP_TTL_SECONDS - 5);
    expect(seconds).toBeLessThanOrEqual(OTP_TTL_SECONDS);
  });

  it('stores the hash, never the code itself', async () => {
    const id = userId();
    const { code } = await otp.issue(OtpPurpose.REGISTRATION, id);
    const stored = await redis.get(`otp:REGISTRATION:${id}`);
    expect(stored).not.toContain(code);
    expect(JSON.parse(stored!).otpHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sets a TTL, so an abandoned code cannot linger', async () => {
    const id = userId();
    await otp.issue(OtpPurpose.REGISTRATION, id);
    expect(await redis.ttl(`otp:REGISTRATION:${id}`)).toBeGreaterThan(OTP_TTL_SECONDS - 5);
  });

  it('a newer code replaces an older one', async () => {
    const id = userId();
    const first = await otp.issue(OtpPurpose.REGISTRATION, id);
    await otp.issue(OtpPurpose.REGISTRATION, id);
    await expect(otp.verify(OtpPurpose.REGISTRATION, id, first.code)).rejects.toMatchObject({
      code: 'OTP_INVALID',
    });
  });
});

describe('verify', () => {
  it('accepts the right code', async () => {
    const id = userId();
    const { code } = await otp.issue(OtpPurpose.REGISTRATION, id);
    await expect(otp.verify(OtpPurpose.REGISTRATION, id, code)).resolves.toBeUndefined();
  });

  it('consumes the code, so it cannot be used twice', async () => {
    const id = userId();
    const { code } = await otp.issue(OtpPurpose.REGISTRATION, id);
    await otp.verify(OtpPurpose.REGISTRATION, id, code);
    await expect(otp.verify(OtpPurpose.REGISTRATION, id, code)).rejects.toMatchObject({
      code: 'OTP_EXPIRED',
    });
  });

  it('returns the stored payload, which is how the new email survives EMAIL_CHANGE', async () => {
    const id = userId();
    const { code } = await otp.issue(OtpPurpose.NEW_EMAIL_VERIFY, id, 'encrypted-new-email');
    await expect(otp.verify(OtpPurpose.NEW_EMAIL_VERIFY, id, code)).resolves.toBe(
      'encrypted-new-email',
    );
  });

  it('counts down attemptsRemaining on each wrong guess', async () => {
    const id = userId();
    await otp.issue(OtpPurpose.REGISTRATION, id);
    for (const remaining of [2, 1]) {
      await expect(otp.verify(OtpPurpose.REGISTRATION, id, '000000')).rejects.toMatchObject({
        code: 'OTP_INVALID',
        details: { attemptsRemaining: remaining },
      });
    }
  });

  it('destroys the code on the third wrong guess, even if the next guess is right', async () => {
    const id = userId();
    const { code } = await otp.issue(OtpPurpose.REGISTRATION, id);
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      await otp.verify(OtpPurpose.REGISTRATION, id, '000000').catch(() => undefined);
    }
    await expect(otp.verify(OtpPurpose.REGISTRATION, id, code)).rejects.toMatchObject({
      code: 'OTP_EXPIRED',
    });
  });

  it('a wrong guess does not extend the code’s life (KEEPTTL)', async () => {
    const id = userId();
    await otp.issue(OtpPurpose.REGISTRATION, id);
    await redis.expire(`otp:REGISTRATION:${id}`, 30);
    await otp.verify(OtpPurpose.REGISTRATION, id, '000000').catch(() => undefined);
    expect(await redis.ttl(`otp:REGISTRATION:${id}`)).toBeLessThanOrEqual(30);
  });

  it('a code for one purpose does not verify for another', async () => {
    const id = userId();
    const { code } = await otp.issue(OtpPurpose.PASSWORD_CHANGE, id);
    await expect(otp.verify(OtpPurpose.DEACTIVATION, id, code)).rejects.toMatchObject({
      code: 'OTP_EXPIRED',
    });
  });

  it('reports a missing code as expired, not as wrong', async () => {
    // "No such code", "expired" and "out of attempts" must be indistinguishable.
    await expect(otp.verify(OtpPurpose.REGISTRATION, userId(), '123456')).rejects.toMatchObject({
      code: 'OTP_EXPIRED',
    });
  });

  it('caps attempts even when guesses arrive at the same moment', async () => {
    // The reason the check is a Lua script: as separate commands these would interleave
    // and allow more than OTP_MAX_ATTEMPTS.
    const id = userId();
    const { code } = await otp.issue(OtpPurpose.REGISTRATION, id);
    await Promise.all(
      Array.from({ length: 10 }, () =>
        otp.verify(OtpPurpose.REGISTRATION, id, '000000').catch(() => undefined),
      ),
    );
    await expect(otp.verify(OtpPurpose.REGISTRATION, id, code)).rejects.toMatchObject({
      code: 'OTP_EXPIRED',
    });
  });
});

describe('assertWithinRequestLimit', () => {
  it('allows the first three requests in the window', async () => {
    const subject = userId();
    for (let i = 0; i < OTP_MAX_REQUESTS; i++) {
      await expect(otp.assertWithinRequestLimit(subject)).resolves.toBeUndefined();
    }
  });

  it('blocks the fourth for 15 minutes, with retryAfterSeconds', async () => {
    const subject = userId();
    for (let i = 0; i < OTP_MAX_REQUESTS; i++) await otp.assertWithinRequestLimit(subject);
    await expect(otp.assertWithinRequestLimit(subject)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      details: { retryAfterSeconds: OTP_BLOCK_SECONDS },
    });
  });

  it('keeps refusing while the block lasts, and counts down', async () => {
    const subject = userId();
    for (let i = 0; i < OTP_MAX_REQUESTS + 1; i++) {
      await otp.assertWithinRequestLimit(subject).catch(() => undefined);
    }
    const error = await otp.assertWithinRequestLimit(subject).catch((e) => e);
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.details.retryAfterSeconds).toBeLessThanOrEqual(OTP_BLOCK_SECONDS);
    expect(error.details.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('limits each subject separately', async () => {
    const a = userId();
    const b = userId();
    for (let i = 0; i < OTP_MAX_REQUESTS + 1; i++) {
      await otp.assertWithinRequestLimit(a).catch(() => undefined);
    }
    await expect(otp.assertWithinRequestLimit(b)).resolves.toBeUndefined();
  });

  it('does not let simultaneous requests slip past the limit', async () => {
    const subject = userId();
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        otp.assertWithinRequestLimit(subject).then(() => 'allowed').catch(() => 'blocked'),
      ),
    );
    expect(results.filter((r) => r === 'allowed')).toHaveLength(OTP_MAX_REQUESTS);
  });
});

/**
 * A pending sign-up keeps its code inside its own reg:{emailHash} record, so the record can
 * outlive the code it is waiting for and a resend has something to resend into.
 */
describe('records', () => {
  const PENDING = { userId: 'u-1', displayName: 'Alex Tan', passwordHash: '$2b$12$hash' };
  const regKey = (subject: string) => `reg:${subject}`;
  const RECORD_TTL = 15 * 60;

  it('stores the extra fields alongside the code, and none of the code itself', async () => {
    const subject = userId();
    const { code } = await otp.issueRecord(
      regKey(subject),
      OtpPurpose.REGISTRATION,
      subject,
      PENDING,
      RECORD_TTL,
    );

    const stored = JSON.parse((await redis.get(regKey(subject)))!);
    expect(stored).toMatchObject(PENDING);
    expect(stored.otpHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(code);
  });

  it('gives the record a longer life than the code inside it', async () => {
    const subject = userId();
    await otp.issueRecord(regKey(subject), OtpPurpose.REGISTRATION, subject, PENDING, RECORD_TTL);

    expect(await redis.ttl(regKey(subject))).toBeGreaterThan(OTP_TTL_SECONDS);
    const stored = JSON.parse((await redis.get(regKey(subject)))!);
    const codeLife = (stored.otpExpiresAt - Date.now()) / 1000;
    expect(codeLife).toBeLessThanOrEqual(OTP_TTL_SECONDS);
  });

  it('returns everything that was stored, and consumes the record', async () => {
    const subject = userId();
    const { code } = await otp.issueRecord(
      regKey(subject),
      OtpPurpose.REGISTRATION,
      subject,
      PENDING,
      RECORD_TTL,
    );

    await expect(
      otp.verifyRecord(regKey(subject), OtpPurpose.REGISTRATION, subject, code),
    ).resolves.toMatchObject(PENDING);
    expect(await redis.exists(regKey(subject))).toBe(0);
  });

  it('refuses a code past its own deadline even while the record is still alive', async () => {
    const subject = userId();
    const { code } = await otp.issueRecord(
      regKey(subject),
      OtpPurpose.REGISTRATION,
      subject,
      PENDING,
      RECORD_TTL,
    );

    // The record's TTL cannot express the code's shorter life, so the deadline lives inside
    // it. Age the code by rewriting that field rather than waiting five minutes.
    const stored = JSON.parse((await redis.get(regKey(subject)))!);
    await redis.set(
      regKey(subject),
      JSON.stringify({ ...stored, otpExpiresAt: Date.now() - 1000 }),
      'KEEPTTL',
    );

    await expect(
      otp.verifyRecord(regKey(subject), OtpPurpose.REGISTRATION, subject, code),
    ).rejects.toMatchObject({ code: 'OTP_EXPIRED' });

    // ...and the sign-up survives, so the user can ask for a new code instead of starting over.
    expect(await redis.exists(regKey(subject))).toBe(1);
  });

  it('reports a record that is not there as expired, not as missing', async () => {
    // AGENTS.md, "Register and verify": /auth/register/verify must answer the same way whether
    // the code was wrong or no sign-up was ever waiting, or the response tells a caller which
    // addresses are mid-sign-up.
    const subject = userId();

    await expect(
      otp.verifyRecord(regKey(subject), OtpPurpose.REGISTRATION, subject, '123456'),
    ).rejects.toMatchObject({ code: 'OTP_EXPIRED' });
  });

  it('reissue replaces the code and keeps the record', async () => {
    const subject = userId();
    const first = await otp.issueRecord(
      regKey(subject),
      OtpPurpose.REGISTRATION,
      subject,
      PENDING,
      RECORD_TTL,
    );

    const second = await otp.reissueRecord(regKey(subject), OtpPurpose.REGISTRATION, subject);

    await expect(
      otp.verifyRecord(regKey(subject), OtpPurpose.REGISTRATION, subject, first.code),
    ).rejects.toMatchObject({ code: 'OTP_INVALID' });
    await expect(
      otp.verifyRecord(regKey(subject), OtpPurpose.REGISTRATION, subject, second!.code),
    ).resolves.toMatchObject(PENDING);
  });

  it('reissue does not extend the sign-up window (KEEPTTL)', async () => {
    const subject = userId();
    await otp.issueRecord(regKey(subject), OtpPurpose.REGISTRATION, subject, PENDING, RECORD_TTL);
    await redis.expire(regKey(subject), 60);

    await otp.reissueRecord(regKey(subject), OtpPurpose.REGISTRATION, subject);

    expect(await redis.ttl(regKey(subject))).toBeLessThanOrEqual(60);
  });

  it('reissue gives the new code a full set of attempts', async () => {
    const subject = userId();
    await otp.issueRecord(regKey(subject), OtpPurpose.REGISTRATION, subject, PENDING, RECORD_TTL);
    for (let i = 0; i < OTP_MAX_ATTEMPTS - 1; i++) {
      await otp
        .verifyRecord(regKey(subject), OtpPurpose.REGISTRATION, subject, '000000')
        .catch(() => undefined);
    }

    await otp.reissueRecord(regKey(subject), OtpPurpose.REGISTRATION, subject);

    await expect(
      otp.verifyRecord(regKey(subject), OtpPurpose.REGISTRATION, subject, '000000'),
    ).rejects.toMatchObject({ details: { attemptsRemaining: OTP_MAX_ATTEMPTS - 1 } });
  });

  it('reissue returns null when there is no record, rather than creating one', async () => {
    const subject = userId();

    await expect(
      otp.reissueRecord(regKey(subject), OtpPurpose.REGISTRATION, subject),
    ).resolves.toBeNull();
    expect(await redis.exists(regKey(subject))).toBe(0);
  });

  it('caps attempts on a record just as on a standalone code', async () => {
    const subject = userId();
    const { code } = await otp.issueRecord(
      regKey(subject),
      OtpPurpose.REGISTRATION,
      subject,
      PENDING,
      RECORD_TTL,
    );

    await Promise.all(
      Array.from({ length: 10 }, () =>
        otp
          .verifyRecord(regKey(subject), OtpPurpose.REGISTRATION, subject, '000000')
          .catch(() => undefined),
      ),
    );

    await expect(
      otp.verifyRecord(regKey(subject), OtpPurpose.REGISTRATION, subject, code),
    ).rejects.toMatchObject({ code: 'OTP_EXPIRED' });
  });
});
