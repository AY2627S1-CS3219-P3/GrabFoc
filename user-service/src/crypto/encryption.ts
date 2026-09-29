/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated AES-256-GCM encryption and decryption for the stored email and mobile.
 * Author review: Read in full; `npm test` passes (46 tests) and the service starts under docker compose with the keys set.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { config } from '../config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits, the size GCM is defined for
const TAG_LENGTH = 16;

/**
 * Encrypts to a single buffer laid out as `iv | tag | ciphertext`, which is what the BYTEA
 * columns `email_encrypted` and `mobile_encrypted` store (U1.2.2, U1.2.3).
 *
 * A fresh random IV per call is what makes the same address encrypt to different bytes every
 * time — which is also why these columns cannot be searched, and why `email_hash` exists.
 * Reusing an IV with the same key breaks GCM badly, so it is generated here and never
 * supplied by a caller.
 */
export function encrypt(plaintext: string): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, config.aesKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

/**
 * Reverses `encrypt`. Throws if the buffer was truncated or altered: GCM authenticates the
 * ciphertext, so tampering is detected rather than silently decrypting to rubbish.
 */
export function decrypt(payload: Buffer): string {
  if (payload.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('Encrypted payload is too short to contain an IV and tag.');
  }
  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, config.aesKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
