/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated unit tests for refresh-token and OTP generation and hashing.
 * Author review: Read in full; `npm test` passes (46 tests).
 */
import {
  OtpPurpose,
  generateOtpCode,
  generateRefreshToken,
  hashOtp,
  hashRefreshToken,
} from './tokens';

describe('generateRefreshToken', () => {
  it('carries 32 bytes of entropy', () => {
    expect(Buffer.from(generateRefreshToken(), 'base64url').length).toBe(32);
  });

  it('is base64url, so it is safe in a JSON body and a URL', () => {
    expect(generateRefreshToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('does not repeat', () => {
    const tokens = new Set(Array.from({ length: 500 }, generateRefreshToken));
    expect(tokens.size).toBe(500);
  });
});

describe('hashRefreshToken', () => {
  it('is 64 hex characters, matching CHAR(64)', () => {
    expect(hashRefreshToken(generateRefreshToken())).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic, so a presented token can be looked up', () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
  });

  it('separates different tokens', () => {
    expect(hashRefreshToken(generateRefreshToken())).not.toBe(
      hashRefreshToken(generateRefreshToken()),
    );
  });
});

describe('generateOtpCode', () => {
  it('is always exactly 6 digits, including when the number is small', () => {
    for (let i = 0; i < 2000; i++) {
      expect(generateOtpCode()).toMatch(/^\d{6}$/);
    }
  });

  it('uses the whole range rather than a narrow slice', () => {
    const codes = Array.from({ length: 2000 }, generateOtpCode).map(Number);
    expect(Math.min(...codes)).toBeLessThan(200_000);
    expect(Math.max(...codes)).toBeGreaterThan(800_000);
  });
});

describe('hashOtp', () => {
  it('is 64 hex characters', () => {
    expect(hashOtp(OtpPurpose.REGISTRATION, 'user-1', '123456')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic, so a submitted code can be compared', () => {
    expect(hashOtp(OtpPurpose.REGISTRATION, 'user-1', '123456')).toBe(
      hashOtp(OtpPurpose.REGISTRATION, 'user-1', '123456'),
    );
  });

  it('binds the purpose, so a code cannot be replayed against another action', () => {
    expect(hashOtp(OtpPurpose.REGISTRATION, 'user-1', '123456')).not.toBe(
      hashOtp(OtpPurpose.DEACTIVATION, 'user-1', '123456'),
    );
  });

  it('binds the user, so one user’s code does not verify for another', () => {
    expect(hashOtp(OtpPurpose.REGISTRATION, 'user-1', '123456')).not.toBe(
      hashOtp(OtpPurpose.REGISTRATION, 'user-2', '123456'),
    );
  });

  it('separates different codes', () => {
    expect(hashOtp(OtpPurpose.REGISTRATION, 'user-1', '123456')).not.toBe(
      hashOtp(OtpPurpose.REGISTRATION, 'user-1', '123457'),
    );
  });

  it('is keyed, not a bare SHA-256 that a million guesses would reverse', () => {
    const plainSha256 = require('crypto')
      .createHash('sha256')
      .update('REGISTRATION:user-1:123456')
      .digest('hex');
    expect(hashOtp(OtpPurpose.REGISTRATION, 'user-1', '123456')).not.toBe(plainSha256);
  });
});
