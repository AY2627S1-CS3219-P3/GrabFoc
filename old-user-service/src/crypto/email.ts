/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated email normalisation and the keyed lookup hash.
 * Author review: Read in full; `npm test` passes (46 tests) and the service starts under docker compose with the keys set.
 */
import { createHmac } from 'crypto';
import { config } from '../config';

/**
 * Trim and lowercase. Every path that validates, encrypts, hashes or compares an address
 * must normalise first, or `Alex@u.nus.edu` and `alex@u.nus.edu` become two accounts.
 * Idempotent, so calling it twice is harmless.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * The value stored in `users.email_hash` and used for every lookup (U1.1.3).
 *
 * AES-256-GCM produces different bytes each time, so the encrypted column cannot be searched
 * or made UNIQUE. This HMAC is deterministic, so it can be both. It is keyed rather than a
 * plain SHA-256 so that a leaked database cannot be reversed by hashing a list of NUS
 * addresses — there are few enough of those to enumerate.
 *
 * Normalises internally, so a caller cannot forget to. Returns 64 lowercase hex characters,
 * matching CHAR(64).
 */
export function hashEmail(email: string): string {
  return createHmac('sha256', config.emailHmacKey).update(normalizeEmail(email)).digest('hex');
}
