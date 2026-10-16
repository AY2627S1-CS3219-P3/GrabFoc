/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated unit tests for AES-256-GCM encryption, including tamper detection.
 * Author review: Read in full; `npm test` passes (46 tests).
 */
import { decrypt, encrypt } from './encryption';

describe('encrypt / decrypt', () => {
  it('round-trips an email address', () => {
    expect(decrypt(encrypt('alex@u.nus.edu'))).toBe('alex@u.nus.edu');
  });

  it('round-trips a mobile number', () => {
    expect(decrypt(encrypt('91234567'))).toBe('91234567');
  });

  it('round-trips non-ASCII text', () => {
    expect(decrypt(encrypt('Ng Wei Ming — 黄伟明'))).toBe('Ng Wei Ming — 黄伟明');
  });

  it('round-trips an empty string', () => {
    expect(decrypt(encrypt(''))).toBe('');
  });

  it('never stores the plaintext in the ciphertext', () => {
    expect(encrypt('alex@u.nus.edu').toString('utf8')).not.toContain('alex@u.nus.edu');
  });

  it('produces different bytes each time, which is why email_hash exists', () => {
    // A fresh IV per call means the encrypted column cannot be searched or made UNIQUE.
    expect(encrypt('alex@u.nus.edu').equals(encrypt('alex@u.nus.edu'))).toBe(false);
  });

  it('lays out iv | tag | ciphertext', () => {
    // 12-byte IV + 16-byte tag + the ciphertext, which for GCM is the plaintext length.
    expect(encrypt('12345').length).toBe(12 + 16 + 5);
  });
});

describe('decrypt rejects damaged input', () => {
  it('throws when the ciphertext was altered', () => {
    const payload = encrypt('alex@u.nus.edu');
    payload[payload.length - 1] ^= 0xff;
    expect(() => decrypt(payload)).toThrow();
  });

  it('throws when the authentication tag was altered', () => {
    const payload = encrypt('alex@u.nus.edu');
    payload[13] ^= 0xff;
    expect(() => decrypt(payload)).toThrow();
  });

  it('throws when the payload is truncated', () => {
    expect(() => decrypt(encrypt('alex@u.nus.edu').subarray(0, 10))).toThrow(
      /too short/,
    );
  });
});
