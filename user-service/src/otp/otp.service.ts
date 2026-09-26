/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated OTP issue/verify and the request rate limit, over the Lua scripts. Added
 *        the record variants, which hold a code inside a larger value such as a pending
 *        sign-up.
 * Author review: Read in full; `npm run test:int` passes (18 tests against a real Redis), including the concurrency cases the scripts exist for.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppError } from '../common/app-error';
import { ErrorCode } from '../common/error-codes';
import { OtpPurpose, generateOtpCode, hashOtp } from '../crypto';
import { REDIS } from '../redis/redis.module';
import { RATE_LIMIT_LUA, REISSUE_OTP_LUA, VERIFY_OTP_LUA } from './otp.scripts';

/** AGENTS.md, "OTP". Changing any of these changes a documented rule. */
export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 3;
export const OTP_MAX_REQUESTS = 3;
export const OTP_REQUEST_WINDOW_SECONDS = 10 * 60;
export const OTP_BLOCK_SECONDS = 15 * 60;

/**
 * The shape every OTP record shares, whatever else is stored alongside it. The Lua scripts
 * read exactly these three fields, so any value carrying them can be verified by the same
 * script — which is how a pending sign-up keeps its code inside its own record.
 */
export interface OtpRecord {
  otpHash: string;
  attempts: number;
  /** Epoch milliseconds. Checked by the script, because a record may outlive its code. */
  otpExpiresAt: number;
}

interface StoredOtp extends OtpRecord {
  /** Only for NEW_EMAIL_VERIFY: the encrypted new address, held until the code is used. */
  payload?: string;
}

export interface IssuedOtp {
  code: string;
  expiresAt: Date;
}

const otpKey = (purpose: OtpPurpose, subject: string) => `otp:${purpose}:${subject}`;

@Injectable()
export class OtpService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /**
   * Counts one request against the limit: 3 per 10 minutes per subject, then a 15-minute
   * block (U2.3.2). Throws 429 with `retryAfterSeconds` once blocked.
   *
   * The subject is the emailHash for register/resend/forgot and the userId for
   * /users/me/otp, so a known and an unknown address are limited identically and the
   * endpoint cannot be used to discover which addresses have accounts.
   */
  async assertWithinRequestLimit(subject: string): Promise<void> {
    const [status, seconds] = (await this.redis.eval(
      RATE_LIMIT_LUA,
      2,
      `otpreq:${subject}`,
      `otpblock:${subject}`,
      String(OTP_MAX_REQUESTS),
      String(OTP_REQUEST_WINDOW_SECONDS),
      String(OTP_BLOCK_SECONDS),
    )) as [string, number];

    if (status === 'BLOCKED') {
      throw new AppError(429, ErrorCode.RATE_LIMITED, 'Too many codes requested.', {
        retryAfterSeconds: seconds,
      });
    }
  }

  /**
   * Issues a code and returns it, so the caller can mail it. Only the HMAC is stored, so a
   * memory dump does not reveal live codes.
   *
   * Writing the key replaces any existing one for the same purpose and subject, which is what
   * makes an older code stop working as soon as a newer one is sent.
   */
  async issue(purpose: OtpPurpose, subject: string, payload?: string): Promise<IssuedOtp> {
    return this.issueRecord(otpKey(purpose, subject), purpose, subject, { payload });
  }

  /**
   * Checks a submitted code and consumes it. Returns the stored payload, if the purpose had
   * one.
   *
   * Throws 400 OTP_INVALID with `attemptsRemaining`, or 400 OTP_EXPIRED when the code is
   * missing, expired or out of attempts — those three are deliberately indistinguishable.
   */
  async verify(purpose: OtpPurpose, subject: string, code: string): Promise<string | undefined> {
    const record = await this.verifyRecord<StoredOtp>(otpKey(purpose, subject), purpose, subject, code);
    return record.payload;
  }

  /** Drops an outstanding code, e.g. when an action is abandoned. */
  async discard(purpose: OtpPurpose, subject: string): Promise<void> {
    await this.redis.del(otpKey(purpose, subject));
  }

  // ── Records ────────────────────────────────────────────────────────────────────────────
  //
  // A code normally lives alone under otp:{purpose}:{subject}. A pending sign-up instead
  // keeps its code inside its own reg:{emailHash} record (AGENTS.md, "Redis keys"), so that
  // the sign-up data and the code it is waiting for are written, expire and are consumed
  // together — there is no window in which a verified code finds no sign-up to complete.
  //
  // Both go through the same Lua scripts, so the attempt cap, the single-use rule and the
  // deliberate INVALID/EXPIRED ambiguity have exactly one implementation.

  /**
   * Writes `fields` plus a fresh code to `key`, and returns the code to mail.
   *
   * `ttlSeconds` is the life of the whole record, which for a pending sign-up is longer than
   * the code's own five minutes — the code's deadline is stored in the record and enforced by
   * the verify script.
   */
  async issueRecord<T extends object>(
    key: string,
    purpose: OtpPurpose,
    subject: string,
    fields: T,
    ttlSeconds = OTP_TTL_SECONDS,
  ): Promise<IssuedOtp> {
    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);
    const record: OtpRecord & T = {
      ...fields,
      otpHash: hashOtp(purpose, subject, code),
      attempts: 0,
      otpExpiresAt: expiresAt.getTime(),
    };

    await this.redis.set(key, JSON.stringify(record), 'EX', ttlSeconds);

    return { code, expiresAt };
  }

  /**
   * Replaces the code in an existing record, keeping both the record and its remaining life.
   * Returns null when there is nothing to resend, so the caller decides what that means —
   * for a pending sign-up it is a 404.
   */
  async reissueRecord(key: string, purpose: OtpPurpose, subject: string): Promise<IssuedOtp | null> {
    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

    const updated = (await this.redis.eval(
      REISSUE_OTP_LUA,
      1,
      key,
      hashOtp(purpose, subject, code),
      String(expiresAt.getTime()),
    )) as number;

    return updated === 1 ? { code, expiresAt } : null;
  }

  /**
   * Checks a submitted code against a record and consumes the record, returning everything
   * that was stored with it.
   *
   * Throws 400 OTP_INVALID with `attemptsRemaining`, or 400 OTP_EXPIRED when the code is
   * missing, expired or out of attempts — those three are deliberately indistinguishable, so
   * a caller cannot learn which of them happened.
   */
  async verifyRecord<T>(
    key: string,
    purpose: OtpPurpose,
    subject: string,
    code: string,
  ): Promise<T> {
    const [status, attemptsRemaining, raw] = (await this.redis.eval(
      VERIFY_OTP_LUA,
      1,
      key,
      hashOtp(purpose, subject, code),
      String(OTP_MAX_ATTEMPTS),
      String(Date.now()),
    )) as [string, number, string];

    if (status === 'OK') {
      return JSON.parse(raw) as T;
    }

    if (status === 'INVALID') {
      throw new AppError(400, ErrorCode.OTP_INVALID, 'That code is not correct.', {
        attemptsRemaining,
      });
    }

    throw new AppError(
      400,
      ErrorCode.OTP_EXPIRED,
      'That code has expired. Please request a new one.',
    );
  }
}
