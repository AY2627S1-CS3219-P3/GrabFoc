/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated OTP issue/verify and the request rate limit, over the Lua scripts.
 * Author review: Read in full; `npm run test:int` passes (18 tests against a real Redis), including the concurrency cases the scripts exist for.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppError } from '../common/app-error';
import { ErrorCode } from '../common/error-codes';
import { OtpPurpose, generateOtpCode, hashOtp } from '../crypto';
import { REDIS } from '../redis/redis.module';
import { RATE_LIMIT_LUA, VERIFY_OTP_LUA } from './otp.scripts';

/** AGENTS.md, "OTP". Changing any of these changes a documented rule. */
export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 3;
export const OTP_MAX_REQUESTS = 3;
export const OTP_REQUEST_WINDOW_SECONDS = 10 * 60;
export const OTP_BLOCK_SECONDS = 15 * 60;

interface StoredOtp {
  otpHash: string;
  attempts: number;
  /** Only for NEW_EMAIL_VERIFY: the encrypted new address, held until the code is used. */
  payload?: string;
}

export interface IssuedOtp {
  code: string;
  expiresAt: Date;
}

const otpKey = (purpose: OtpPurpose, userId: string) => `otp:${purpose}:${userId}`;

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
   * Writing the key replaces any existing one for the same purpose and user, which is what
   * makes an older code stop working as soon as a newer one is sent.
   */
  async issue(purpose: OtpPurpose, userId: string, payload?: string): Promise<IssuedOtp> {
    const code = generateOtpCode();
    const stored: StoredOtp = { otpHash: hashOtp(purpose, userId, code), attempts: 0, payload };

    await this.redis.set(otpKey(purpose, userId), JSON.stringify(stored), 'EX', OTP_TTL_SECONDS);

    return { code, expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000) };
  }

  /**
   * Checks a submitted code and consumes it. Returns the stored payload, if the purpose had
   * one.
   *
   * Throws 400 OTP_INVALID with `attemptsRemaining`, or 400 OTP_EXPIRED when the code is
   * missing, expired or out of attempts — those three are deliberately indistinguishable.
   */
  async verify(purpose: OtpPurpose, userId: string, code: string): Promise<string | undefined> {
    const [status, attemptsRemaining, raw] = (await this.redis.eval(
      VERIFY_OTP_LUA,
      1,
      otpKey(purpose, userId),
      hashOtp(purpose, userId, code),
      String(OTP_MAX_ATTEMPTS),
    )) as [string, number, string];

    if (status === 'OK') {
      return (JSON.parse(raw) as StoredOtp).payload;
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

  /** Drops an outstanding code, e.g. when an action is abandoned. */
  async discard(purpose: OtpPurpose, userId: string): Promise<void> {
    await this.redis.del(otpKey(purpose, userId));
  }
}
