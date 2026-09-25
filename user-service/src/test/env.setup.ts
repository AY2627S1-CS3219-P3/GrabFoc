/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated the Jest environment setup and the generated RS256 test key pair.
 * Author review: Read in full; `npm test` passes (46 tests).
 */

import { generateKeyPairSync } from 'crypto';

/**
 * `config.ts` validates the environment when it is first imported, so anything that reaches
 * it through the crypto helpers needs these set before the test runs.
 *
 * The keys are FIXED so HMAC outputs are deterministic and the tests can assert exact
 * values. They are test fixtures, not secrets, and are not used anywhere else.
 */
process.env.USER_DATABASE_URL ||= 'postgres://test@127.0.0.1:5432/test';
process.env.USER_AES_KEY ||= 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';
process.env.USER_EMAIL_HMAC_KEY ||= 'ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8=';
process.env.USER_OTP_HMAC_KEY ||= 'QEFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaW1xdXl8=';

/**
 * The RS256 test key pair is GENERATED, never committed. A private key in the repository —
 * even one only the tests use — is the kind of thing a secret scanner flags and a careless
 * reader reuses. Generating costs a few hundred milliseconds per test file.
 */
function generatePkcs8Base64(): string {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return Buffer.from(privateKey).toString('base64');
}

process.env.USER_JWT_KID ||= 'test-kid';
process.env.USER_JWT_PRIVATE_KEY ||= generatePkcs8Base64();

/** A second pair, used only to prove a token signed elsewhere is rejected. */
export const FOREIGN_JWT_PRIVATE_KEY_B64 = generatePkcs8Base64();
