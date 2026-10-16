/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated unit tests for password hashing and the dummy hash.
 * Author review: Read in full; `npm test` passes (46 tests).
 */
import {
  BCRYPT_COST,
  DUMMY_PASSWORD_HASH,
  MAX_PASSWORD_LENGTH,
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

describe('the 72-byte bound', () => {
  it('is 72, matching what bcrypt actually reads', () => {
    expect(MAX_PASSWORD_LENGTH).toBe(72);
  });

  it('accepts a password exactly at the limit', async () => {
    await expect(hashPassword('A'.repeat(72))).resolves.toMatch(/^\$2[aby]\$12\$/);
  });

  it('rejects one character past it, rather than truncating', async () => {
    // Without the bound, this hash would also verify a completely different 73+ character
    // password sharing the first 72 bytes.
    await expect(hashPassword('A'.repeat(73))).rejects.toThrow(/truncate/);
  });

  it('counts BYTES, so 24 Chinese characters are rejected', async () => {
    // 3 bytes each = 72 bytes at 24 characters. A character-only check would pass this
    // through and let bcrypt truncate it silently.
    const chinese = '\u5bc6'.repeat(25);
    expect(chinese.length).toBe(25);
    expect(Buffer.byteLength(chinese, 'utf8')).toBe(75);
    await expect(hashPassword(chinese)).rejects.toThrow(/truncate/);
  });

  it('counts BYTES, so a short emoji password is rejected', async () => {
    const emoji = '\u{1F600}'.repeat(19); // 4 bytes each = 76 bytes
    await expect(hashPassword(emoji)).rejects.toThrow(/truncate/);
  });

  it('refuses a correct 72-byte password followed by extra bytes', async () => {
    // bcrypt truncates on comparison too, so without the guard this returns true: the
    // caller submits the real password plus anything and is let in.
    const real = 'A'.repeat(72);
    const stored = await hashPassword(real);
    expect(await verifyPassword(real, stored)).toBe(true);
    expect(await verifyPassword(real + 'ANYTHING-AT-ALL', stored)).toBe(false);
  });

  it('costs the same for an over-long candidate, so length is not detectable by timing', async () => {
    const stored = await hashPassword('A'.repeat(72));
    const started = Date.now();
    await verifyPassword('A'.repeat(200), stored);
    // A bare early return would be near-instant; a real bcrypt comparison at cost 12 is
    // hundreds of milliseconds. The floor is deliberately loose to avoid flakiness.
    expect(Date.now() - started).toBeGreaterThan(50);
  });

  it('still accepts ordinary non-ASCII passwords under the limit', async () => {
    const ok = 'Contrase\u00f1a1Segura';
    expect(Buffer.byteLength(ok, 'utf8')).toBeLessThanOrEqual(72);
    await expect(hashPassword(ok)).resolves.toMatch(/^\$2[aby]\$12\$/);
  });
});
