/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated the bcrypt wrapper and the dummy hash used to equalise login timing.
 *        Added the 72-byte bound after review found bcrypt truncates longer inputs.
 * Author review: Read in full; `npm test` passes (46 tests) and the service starts under docker compose with the keys set.
 */
import { compare, hash } from 'bcryptjs';

/**
 * bcrypt work factor (U1.2.1). Each increment doubles the time to verify. 12 is the usual
 * floor today; raising it later is safe because the cost is stored inside the hash, so old
 * hashes keep verifying.
 */
export const BCRYPT_COST = 12;

/**
 * The password policy's upper bound (U1.1.4). Set to 72 because **bcrypt reads only the
 * first 72 bytes** and silently discards the rest — two passwords sharing a 72-byte prefix
 * would otherwise verify against the same hash.
 */
export const MAX_PASSWORD_LENGTH = 72;

/**
 * Produces a 60-character bcrypt hash, which is what `users.password_hash` holds.
 *
 * Rejects anything over 72 **bytes**, not 72 characters. They are the same for ASCII, but
 * UTF-8 uses 2–4 bytes for anything else: 24 Chinese characters or 18 emoji already reach
 * the limit. A character-only check would let those through and truncate them silently,
 * which is the bug this bound exists to prevent.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  // `async`, so an over-long password REJECTS rather than throwing synchronously. A
  // function that sometimes throws and sometimes rejects blows up in any caller that only
  // writes `.catch(...)`.
  if (Buffer.byteLength(plaintext, 'utf8') > MAX_PASSWORD_LENGTH) {
    throw new Error(
      `Password exceeds ${MAX_PASSWORD_LENGTH} bytes; bcrypt would silently truncate it.`,
    );
  }
  return hash(plaintext, BCRYPT_COST);
}

export function verifyPassword(plaintext: string, passwordHash: string): Promise<boolean> {
  return compare(plaintext, passwordHash);
}

/**
 * A real bcrypt hash of a random string nobody holds.
 *
 * Login compares against this when the email is unknown, or when `password_hash` is NULL
 * (the bootstrap admin before activation). Returning 401 immediately would make an unknown
 * address measurably faster than a known one with a wrong password, which turns the login
 * endpoint into an account-enumeration oracle (AGENTS.md, "Login" step 2).
 *
 * Hardcoded rather than computed at startup so it costs nothing to boot, and so the timing
 * is identical on the very first request.
 */
export const DUMMY_PASSWORD_HASH = '$2b$12$b8LEOM0Z5e6Nt2Y55OpKqe8sIUQBV2zsvQ.EDn2/RE6T9h42pTx3i';
