/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated unit tests for the redaction helper.
 * Author review: Read in full; `npm test` passes (7 tests).
 */
import { redact, logLevelsFrom } from './logger';

describe('redact', () => {
  it('removes the fields NFR5.1 forbids logging', () => {
    expect(
      redact({
        password: 'Sup3rSecret',
        otp: '123456',
        refreshToken: 'abc',
        email: 'alex@u.nus.edu',
        mobileNumber: '91234567',
      }),
    ).toEqual({
      password: '[REDACTED]',
      otp: '[REDACTED]',
      refreshToken: '[REDACTED]',
      email: '[REDACTED]',
      mobileNumber: '[REDACTED]',
    });
  });

  it('keeps fields that are safe to log', () => {
    expect(redact({ userId: 'u-1', role: 'ADMIN', status: 'ACTIVE' })).toEqual({
      userId: 'u-1',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
  });

  it('ignores case, dashes and underscores in field names', () => {
    expect(redact({ 'X-Service-Key': 'k', password_hash: 'h', OTP: '1' })).toEqual({
      'X-Service-Key': '[REDACTED]',
      password_hash: '[REDACTED]',
      OTP: '[REDACTED]',
    });
  });

  it('reaches into nested objects and arrays', () => {
    expect(redact({ user: { email: 'a@u.nus.edu' }, attempts: [{ otp: '1' }] })).toEqual({
      user: { email: '[REDACTED]' },
      attempts: [{ otp: '[REDACTED]' }],
    });
  });

  it('leaves non-objects alone', () => {
    expect(redact('a plain message')).toBe('a plain message');
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBeNull();
  });
});

describe('logLevelsFrom', () => {
  it('enables the given level and everything more severe', () => {
    expect(logLevelsFrom('log')).toEqual(['log', 'warn', 'error', 'fatal']);
  });

  it('keeps warnings and errors visible at the default level', () => {
    expect(logLevelsFrom('log')).toContain('error');
    expect(logLevelsFrom('log')).toContain('warn');
  });
});
