/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated unit tests for email normalisation and the lookup hash.
 * Author review: Read in full; `npm test` passes (46 tests).
 */
import { hashEmail, normalizeEmail } from './email';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Alex@U.NUS.edu \n')).toBe('alex@u.nus.edu');
  });

  it('is idempotent, so calling it twice is harmless', () => {
    const once = normalizeEmail(' Alex@u.nus.edu ');
    expect(normalizeEmail(once)).toBe(once);
  });
});

describe('hashEmail', () => {
  it('is 64 lowercase hex characters, matching CHAR(64)', () => {
    expect(hashEmail('alex@u.nus.edu')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic, so it can be looked up and made UNIQUE', () => {
    expect(hashEmail('alex@u.nus.edu')).toBe(hashEmail('alex@u.nus.edu'));
  });

  it('treats differently-cased and padded addresses as one account (F2)', () => {
    expect(hashEmail('  Alex@U.NUS.edu ')).toBe(hashEmail('alex@u.nus.edu'));
  });

  it('separates different addresses', () => {
    expect(hashEmail('alex@u.nus.edu')).not.toBe(hashEmail('alexa@u.nus.edu'));
  });

  it('is keyed, not a bare SHA-256 of the address', () => {
    // If the key were ignored, this would equal the plain digest and a leaked database
    // could be reversed with a list of NUS addresses.
    const plainSha256 = require('crypto')
      .createHash('sha256')
      .update('alex@u.nus.edu')
      .digest('hex');
    expect(hashEmail('alex@u.nus.edu')).not.toBe(plainSha256);
  });
});
