/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-26
 * Scope: Generated the schema tests, one per rule recorded under "Rules" in AGENTS.md.
 * Author review: Read in full; every case traced back to the backlog ID it cites.
 */
import { MAX_PASSWORD_LENGTH } from '../crypto';
import { RegisterSchema, ResendOtpSchema, VerifyRegistrationSchema } from './auth.schemas';

const VALID = {
  displayName: 'Alex Tan',
  email: 'alex@u.nus.edu',
  countryCode: '+65',
  mobileNumber: '91234567',
  password: 'Passw0rdSafe',
};

/** The field names a failed parse complains about, so a test can assert on them. */
function failingFields(body: unknown): string[] {
  const result = RegisterSchema.safeParse(body);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join('.'));
}

describe('email (U1.1.1, U2.1.1)', () => {
  it('accepts both NUS domains', () => {
    for (const email of ['alex@u.nus.edu', 'prof@nus.edu.sg']) {
      expect(RegisterSchema.safeParse({ ...VALID, email }).success).toBe(true);
    }
  });

  it('rejects any other domain', () => {
    for (const email of ['alex@gmail.com', 'alex@nus.edu', 'alex@u.nus.edu.evil.com']) {
      expect(failingFields({ ...VALID, email })).toContain('email');
    }
  });

  it('rejects a subdomain of an allowed domain, which we do not control', () => {
    expect(failingFields({ ...VALID, email: 'alex@evil.u.nus.edu' })).toContain('email');
  });

  it('normalises case and surrounding space, so one address cannot become two accounts', () => {
    const parsed = RegisterSchema.parse({ ...VALID, email: '  Alex@U.NUS.edu  ' });
    expect(parsed.email).toBe('alex@u.nus.edu');
  });

  it('rejects something that is not an address at all', () => {
    expect(failingFields({ ...VALID, email: 'u.nus.edu' })).toContain('email');
  });
});

describe('password (U1.1.4, U3.2.2)', () => {
  it('accepts the shortest allowed password', () => {
    expect(RegisterSchema.safeParse({ ...VALID, password: 'Passw0rd' }).success).toBe(true);
  });

  it('rejects one under 8 characters', () => {
    expect(failingFields({ ...VALID, password: 'Pas5w0r' })).toContain('password');
  });

  it.each([
    ['no uppercase', 'passw0rdsafe'],
    ['no lowercase', 'PASSW0RDSAFE'],
    ['no digit', 'PasswordSafe'],
  ])('rejects one with %s', (_label, password) => {
    expect(failingFields({ ...VALID, password })).toContain('password');
  });

  it('accepts exactly 72 bytes', () => {
    const password = 'Aa1' + 'x'.repeat(MAX_PASSWORD_LENGTH - 3);
    expect(Buffer.byteLength(password)).toBe(MAX_PASSWORD_LENGTH);
    expect(RegisterSchema.safeParse({ ...VALID, password }).success).toBe(true);
  });

  it('rejects 73 bytes, which bcrypt would silently truncate', () => {
    const password = 'Aa1' + 'x'.repeat(MAX_PASSWORD_LENGTH - 2);
    expect(failingFields({ ...VALID, password })).toContain('password');
  });

  it('counts bytes, not characters: 24 Chinese characters already reach the limit', () => {
    // 24 x 3 bytes = 72, so adding the three required ASCII characters goes over even though
    // the password is only 27 characters long.
    const password = 'Aa1' + '密'.repeat(24);
    expect(password.length).toBeLessThan(MAX_PASSWORD_LENGTH);
    expect(Buffer.byteLength(password)).toBeGreaterThan(MAX_PASSWORD_LENGTH);
    expect(failingFields({ ...VALID, password })).toContain('password');
  });

  it('never echoes the rejected password back in the message', () => {
    const result = RegisterSchema.safeParse({ ...VALID, password: 'hunter2' });
    expect(JSON.stringify(result)).not.toContain('hunter2');
  });
});

describe('mobile number (U1.1.5, U3.1.3)', () => {
  it('accepts a real Singapore number', () => {
    expect(RegisterSchema.safeParse(VALID).success).toBe(true);
  });

  it('rejects digits that are not a valid number for the country code', () => {
    // Eight digits, so the regex is satisfied, but 1 is not a Singapore prefix.
    expect(failingFields({ ...VALID, mobileNumber: '12345678' })).toContain('mobileNumber');
  });

  it('rejects formatting characters: the country code is a separate field', () => {
    for (const mobileNumber of ['+6591234567', '9123 4567', '9123-4567']) {
      expect(failingFields({ ...VALID, mobileNumber })).toContain('mobileNumber');
    }
  });

  it('rejects a country code without its plus', () => {
    expect(failingFields({ ...VALID, countryCode: '65' })).toContain('countryCode');
  });

  it('accepts another country', () => {
    const body = { ...VALID, countryCode: '+60', mobileNumber: '123456789' };
    expect(RegisterSchema.safeParse(body).success).toBe(true);
  });
});

describe('display name', () => {
  it('rejects an empty or whitespace-only name', () => {
    expect(failingFields({ ...VALID, displayName: '   ' })).toContain('displayName');
  });

  it('rejects one longer than the column', () => {
    expect(failingFields({ ...VALID, displayName: 'a'.repeat(101) })).toContain('displayName');
  });

  it('trims, so the stored name matches what is displayed', () => {
    expect(RegisterSchema.parse({ ...VALID, displayName: '  Alex  ' }).displayName).toBe('Alex');
  });
});

describe('strictness (root AGENTS.md §8)', () => {
  it('rejects a smuggled role rather than ignoring it', () => {
    const result = RegisterSchema.safeParse({ ...VALID, role: 'ADMIN' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown field on every body', () => {
    expect(VerifyRegistrationSchema.safeParse({
      email: VALID.email,
      otp: '123456',
      status: 'ACTIVE',
    }).success).toBe(false);
    expect(ResendOtpSchema.safeParse({ email: VALID.email, otp: '123456' }).success).toBe(false);
  });
});

describe('otp', () => {
  it('accepts six digits, including a leading zero', () => {
    const parsed = VerifyRegistrationSchema.parse({ email: VALID.email, otp: '012345' });
    expect(parsed.otp).toBe('012345');
  });

  it.each([['12345'], ['1234567'], ['12345a'], ['']])('rejects %p', (otp) => {
    expect(VerifyRegistrationSchema.safeParse({ email: VALID.email, otp }).success).toBe(false);
  });

  it('rejects a number, which would lose a leading zero', () => {
    expect(VerifyRegistrationSchema.safeParse({ email: VALID.email, otp: 12345 }).success).toBe(false);
  });
});
