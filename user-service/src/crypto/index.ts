/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated the barrel export for the crypto helpers.
 * Author review: Read in full; `npm test` passes (46 tests) and the service starts under docker compose with the keys set.
 */

/**
 * Every cryptographic operation in the service lives under `src/crypto`. Nothing outside it
 * should import `crypto` directly or read a key from `config`, so there is one place to
 * review when the marking asks how credentials are protected.
 */
export { normalizeEmail, hashEmail } from './email';
export {
  BCRYPT_COST,
  DUMMY_PASSWORD_HASH,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  hashPassword,
  verifyPassword,
} from './password';
export { encrypt, decrypt } from './encryption';
export {
  OtpPurpose,
  generateId,
  generateRefreshToken,
  hashRefreshToken,
  generateOtpCode,
  hashOtp,
} from './tokens';
