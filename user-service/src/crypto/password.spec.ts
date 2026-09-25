/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated unit tests for password hashing and the dummy hash.
 * Author review: Read in full; `npm test` passes (46 tests).
 */
import {
  BCRYPT_COST,
  DUMMY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
} from './password';

describe('hashPassword', () => {
  it('produces a bcrypt hash at the agreed cost (U1.2.1)', async () => {
    const hash = await hashPassword('Correct1Horse');
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(BCRYPT_COST).toBe(12);
  });

  it('fits users.password_hash VARCHAR(100)', async () => {
    expect((await hashPassword('Correct1Horse')).length).toBeLessThanOrEqual(100);
  });

  it('salts, so the same password hashes differently every time', async () => {
    expect(await hashPassword('Correct1Horse')).not.toBe(await hashPassword('Correct1Horse'));
  });
});

describe('verifyPassword', () => {
  it('accepts the right password despite the differing salt', async () => {
    expect(await verifyPassword('Correct1Horse', await hashPassword('Correct1Horse'))).toBe(true);
  });

  it('rejects the wrong password', async () => {
    expect(await verifyPassword('Wrong1Horse', await hashPassword('Correct1Horse'))).toBe(false);
  });

  it('is case-sensitive', async () => {
    expect(await verifyPassword('correct1horse', await hashPassword('Correct1Horse'))).toBe(false);
  });
});

describe('DUMMY_PASSWORD_HASH', () => {
  it('is a real bcrypt hash at the same cost, so login timing matches', () => {
    // A cheaper hash, or a non-hash, would make an unknown email measurably faster to
    // reject than a known one — an account-enumeration oracle.
    expect(DUMMY_PASSWORD_HASH).toMatch(/^\$2[aby]\$12\$/);
  });

  it('verifies against nothing a caller could send', async () => {
    expect(await verifyPassword('', DUMMY_PASSWORD_HASH)).toBe(false);
    expect(await verifyPassword('password', DUMMY_PASSWORD_HASH)).toBe(false);
  });
});
