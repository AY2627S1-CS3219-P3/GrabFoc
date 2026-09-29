/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated refresh-token and OTP generation, and their stored hashes.
 * Author review: Read in full; `npm test` passes (46 tests) and the service starts under docker compose with the keys set.
 */
import { createHash, createHmac, randomBytes, randomInt, randomUUID } from 'crypto';
import { config } from '../config';

/** Purposes an OTP can be issued for (AGENTS.md, "Redis keys"). */
export const OtpPurpose = {
  REGISTRATION: 'REGISTRATION',
  PASSWORD_RESET: 'PASSWORD_RESET',
  EMAIL_CHANGE: 'EMAIL_CHANGE',
  NEW_EMAIL_VERIFY: 'NEW_EMAIL_VERIFY',
  MOBILE_CHANGE: 'MOBILE_CHANGE',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  DEACTIVATION: 'DEACTIVATION',
} as const;

export type OtpPurpose = (typeof OtpPurpose)[keyof typeof OtpPurpose];

/**
 * A primary key for `users` or `refresh_tokens`: a v4 UUID from the CSPRNG.
 *
 * It lives here rather than beside the code that inserts the row so that the rule in
 * AGENTS.md — no production file outside `src/crypto` and `src/auth/jwt.service.ts` imports
 * node's `crypto` — stays literally true and therefore auditable. A user id is generated at
 * register time, before any row exists, because the pending sign-up in Redis already refers
 * to it.
 */
export function generateId(): string {
  return randomUUID();
}

/**
 * A refresh token: 32 random bytes, base64url so it is safe in a JSON body and a header.
 * Returned to the caller once and never stored in this form.
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * What `refresh_tokens.token_hash` stores. A plain SHA-256 is enough here, unlike passwords
 * and OTPs: the token is 32 bytes of entropy, so there is no guessable input to brute-force.
 * Returns 64 hex characters, matching CHAR(64).
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * A 6-digit OTP as a zero-padded string (U2.3.2). `randomInt` is drawn from the CSPRNG and
 * is free of the modulo bias a `randomBytes(...) % 1000000` would introduce, so all one
 * million codes are equally likely.
 */
export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * What Redis stores instead of the code itself.
 *
 * Keyed, and bound to the purpose and the user: a 6-digit code has only a million possible
 * values, so a plain SHA-256 of it could be reversed instantly from a memory dump. Binding
 * the purpose and user id also means a code captured for one action cannot be replayed
 * against another.
 */
export function hashOtp(purpose: OtpPurpose, userId: string, code: string): string {
  return createHmac('sha256', config.otpHmacKey)
    .update(`${purpose}:${userId}:${code}`)
    .digest('hex');
}
