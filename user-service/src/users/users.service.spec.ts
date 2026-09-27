/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Sonnet 5), date: 2026-09-28
 * Scope: Generated the spec for UsersService (Step 11), mocking UsersRepository as the only
 *        collaborator, mirroring admin.service.spec.ts's `userRecord()` builder and mocking
 *        style.
 * Author review: Read in full; `npm test` passes, and both endpoints were also exercised via
 *                Postman against the compose stack on 2026-09-28 — see /ai/usage-log.md.
 */
import { Role } from '../auth/caller';
import { encrypt } from '../crypto';
import { UserRecord, UserStatus, UsersRepository } from './users.repository';
import { UsersService } from './users.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function userRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: USER_ID,
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

function build() {
  const users = {
    findById: jest.fn<Promise<UserRecord | null>, [string]>(async () => userRecord()),
    updateDisplayName: jest.fn<Promise<boolean>, [string, string]>(async () => true),
  };

  const service = new UsersService(users as unknown as UsersRepository);

  return { service, users };
}

describe('getSelf', () => {
  it('returns the self profile shape, without role/status/createdAt', async () => {
    const { service } = build();

    const result = await service.getSelf(USER_ID);

    expect(result).toEqual({
      userId: USER_ID,
      displayName: 'Alex Tan',
      email: 'alex@u.nus.edu',
      countryCode: '+65',
      mobileNumber: '91234567',
    });
    expect(result).not.toHaveProperty('role');
    expect(result).not.toHaveProperty('status');
    expect(result).not.toHaveProperty('createdAt');
  });

  it('looks the caller up by id, never by anything from a body or path', async () => {
    const { service, users } = build();

    await service.getSelf(USER_ID);

    expect(users.findById).toHaveBeenCalledWith(USER_ID);
  });
});

describe('updateDisplayName', () => {
  it('writes the new name and returns the refreshed self profile', async () => {
    const { service, users } = build();
    users.findById.mockResolvedValueOnce(userRecord({ displayName: 'New Name' }));

    const result = await service.updateDisplayName(USER_ID, 'New Name');

    expect(users.updateDisplayName).toHaveBeenCalledWith(USER_ID, 'New Name');
    expect(result).toEqual(expect.objectContaining({ displayName: 'New Name' }));
  });

  it('re-reads the row after writing rather than trusting the input back', async () => {
    const { service, users } = build();
    users.findById.mockResolvedValueOnce(userRecord({ displayName: 'Persisted Name' }));

    const result = await service.updateDisplayName(USER_ID, 'Whatever Was Sent');

    expect(result.displayName).toBe('Persisted Name');
  });
});
