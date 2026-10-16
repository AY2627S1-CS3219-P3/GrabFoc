/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Sonnet 5), date: 2026-09-28
 * Scope: Generated the first spec file for profile.mapper.ts, covering the new
 *        toSelfProfileResponse and confirming the toProfileResponse refactor (Step 11) is
 *        behavior-preserving for the admin shape it already served.
 * Author review: Read in full; `npm test` passes.
 */
import { Role } from '../auth/caller';
import { encrypt } from '../crypto';
import { toProfileResponse, toSelfProfileResponse } from './profile.mapper';
import { UserRecord, UserStatus } from './users.repository';

function userRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    displayName: 'Alex Tan',
    emailEncrypted: encrypt('alex@u.nus.edu'),
    countryCode: '+65',
    mobileEncrypted: encrypt('91234567'),
    passwordHash: 'hash',
    role: Role.USER,
    status: UserStatus.ACTIVE,
    createdAt: new Date('2026-09-27T00:00:00Z'),
    updatedAt: new Date('2026-09-27T00:00:00Z'),
    deactivatedAt: null,
    ...overrides,
  } as UserRecord;
}

describe('toSelfProfileResponse', () => {
  it('decrypts email and mobile, and carries no role, status or createdAt', () => {
    const result = toSelfProfileResponse(userRecord());

    expect(result).toEqual({
      userId: '11111111-1111-4111-8111-111111111111',
      displayName: 'Alex Tan',
      email: 'alex@u.nus.edu',
      countryCode: '+65',
      mobileNumber: '91234567',
    });
  });

  it('returns a null mobileNumber for the bootstrap admin (no mobile on file)', () => {
    const result = toSelfProfileResponse(userRecord({ mobileEncrypted: null, countryCode: null }));

    expect(result.mobileNumber).toBeNull();
    expect(result.countryCode).toBeNull();
  });
});

describe('toProfileResponse', () => {
  it('still returns the full admin-facing shape after the Step 11 refactor', () => {
    const result = toProfileResponse(userRecord({ role: Role.ADMIN, status: UserStatus.DEACTIVATED }));

    expect(result).toEqual({
      userId: '11111111-1111-4111-8111-111111111111',
      displayName: 'Alex Tan',
      email: 'alex@u.nus.edu',
      countryCode: '+65',
      mobileNumber: '91234567',
      role: Role.ADMIN,
      status: UserStatus.DEACTIVATED,
      createdAt: '2026-09-27T00:00:00.000Z',
    });
  });
});
