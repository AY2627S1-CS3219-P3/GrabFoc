/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Sonnet 5), date: 2026-09-28
 * Scope: Generated the spec for UsersService (Step 11), mocking UsersRepository as the only
 *        collaborator, mirroring admin.service.spec.ts's `userRecord()` builder and mocking
 *        style.
 * Author review: Read in full; `npm test` passes, and both endpoints were also exercised via
 *                Postman against the compose stack on 2026-09-28 — see /ai/usage-log.md.
 *                2026-09-28: added coverage for the six Step 12 methods, mocking
 *                OtpService, MailService, RefreshTokensRepository and AdminLockService as
 *                collaborators, mirroring admin.service.spec.ts's style of stubbing
 *                AdminLockService.run to hand the callback a fixed context, and
 *                password-reset.service.spec.ts's style of a fake pool/client recording SQL
 *                statements for the transactional changePassword path.
 * Author review: `npm test` passes (267/267), and all six Step 12 methods were also exercised
 *                via Postman against the compose stack on 2026-09-28 — see /ai/usage-log.md.
 *                2026-09-28: updated requestEmailChange/changePassword coverage for check()/
 *                discard() replacing verify() — added mocks for both, renamed the ordering
 *                assertions, and added cases for "rejected business check keeps the code
 *                alive", "mail/DB failure keeps the code alive", and "no business check runs
 *                without a real code" (the oracle this reorder exists to close).
 */
import { Pool, PoolClient } from 'pg';
import { Role } from '../auth/caller';
import { RefreshTokensRepository } from '../auth/refresh-tokens.repository';
import { AppError } from '../common/app-error';
import { ErrorCode } from '../common/error-codes';
import { encrypt, hashPassword, OtpPurpose } from '../crypto';
import { IssuedOtp, OtpService } from '../otp/otp.service';
import { MailService } from '../mail/mail.service';
import { AdminLockContext, AdminLockService } from './admin-lock.service';
import { UserRecord, UserStatus, UsersRepository } from './users.repository';
import { UsersService } from './users.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ADMIN_ID = '33333333-3333-4333-8333-333333333333';

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

/** The current password, hashed once so every test that needs it shares the cost. */
let currentHash: string;

beforeAll(async () => {
  currentHash = await hashPassword('Passw0rdSafe');
});

/**
 * `lockActiveAdminIds` reproduces `AdminLockService`'s own possible outputs (null for a
 * non-admin or stale caller; the locked list of active admin ids otherwise) without re-testing
 * its internals, which `admin-lock.service.spec.ts` already covers in isolation — the same
 * choice `admin.service.spec.ts` makes for `changeRole`.
 */
function build(lockActiveAdminIds: string[] | null = null) {
  const calls: string[] = [];
  const record = (name: string) => calls.push(name);

  const users = {
    findById: jest.fn<Promise<UserRecord | null>, [string]>(async () => {
      record('findById');
      return userRecord();
    }),
    updateDisplayName: jest.fn<Promise<boolean>, [string, string]>(async () => true),
    listUsers: jest.fn<Promise<UserRecord[]>, [{ role?: Role; status?: UserStatus }]>(async () => {
      record('listUsers');
      return [];
    }),
    existsByEmailHash: jest.fn<Promise<boolean>, [string]>(async () => {
      record('existsByEmailHash');
      return false;
    }),
    updateEmail: jest.fn<Promise<boolean>, [string, string, Buffer, PoolClient?]>(async () => {
      record('updateEmail');
      return true;
    }),
    updateMobile: jest.fn<Promise<boolean>, [string, string, Buffer, PoolClient?]>(async () => {
      record('updateMobile');
      return true;
    }),
    updatePasswordHash: jest.fn<Promise<boolean>, [string, string, PoolClient?]>(async () => {
      record('updatePasswordHash');
      return true;
    }),
    deactivate: jest.fn<Promise<boolean>, [string, PoolClient]>(async () => {
      record('deactivate');
      return true;
    }),
  };

  const otp = {
    assertWithinRequestLimit: jest.fn<Promise<void>, [string]>(async () => {
      record('assertWithinRequestLimit');
    }),
    issue: jest.fn<Promise<IssuedOtp>, [OtpPurpose, string, string?]>(async () => {
      record('issue');
      return { code: '123456', expiresAt: new Date('2026-09-28T10:05:00Z') };
    }),
    verify: jest.fn<Promise<string | undefined>, [OtpPurpose, string, string]>(async () => {
      record('verify');
      return undefined;
    }),
    check: jest.fn<Promise<string | undefined>, [OtpPurpose, string, string]>(async () => {
      record('check');
      return undefined;
    }),
    discard: jest.fn<Promise<void>, [OtpPurpose, string]>(async () => {
      record('discard');
    }),
  };

  const mail = {
    sendOtp: jest.fn<Promise<void>, [string, string, OtpPurpose]>(async () => {
      record('sendOtp');
    }),
  };

  const refreshTokens = {
    revokeAllForUser: jest.fn<Promise<number>, [string, PoolClient?]>(async () => {
      record('revokeAllForUser');
      return 2;
    }),
  };

  const lock = {
    run: jest.fn(async (callerId: string, fn: (ctx: AdminLockContext) => Promise<unknown>) => {
      record('lock.run');
      return fn({
        client: {} as AdminLockContext['client'],
        caller: userRecord({ id: callerId }),
        activeAdminIds: lockActiveAdminIds,
      });
    }),
  };

  // `withTransaction` (used by changePassword) checks out one client and wraps the work in
  // BEGIN/COMMIT. Recording the statements is how these tests see whether the two writes
  // committed together — same pattern as password-reset.service.spec.ts.
  const statements: string[] = [];
  const client = {
    query: jest.fn<Promise<unknown>, [string]>(async (sql: string) => {
      statements.push(sql);
      record(`sql:${sql}`);
      return { rows: [] };
    }),
    release: jest.fn(),
  };
  const pool = { connect: jest.fn(async () => client) };

  const service = new UsersService(
    users as unknown as UsersRepository,
    otp as unknown as OtpService,
    mail as unknown as MailService,
    refreshTokens as unknown as RefreshTokensRepository,
    lock as unknown as AdminLockService,
    pool as unknown as Pool,
  );

  return { service, users, otp, mail, refreshTokens, lock, calls, statements, client };
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

describe('requestOtp', () => {
  it('mails a code to the caller\'s current email under the requested purpose', async () => {
    const { service, otp, mail } = build();

    const result = await service.requestOtp(USER_ID, OtpPurpose.PASSWORD_CHANGE);

    expect(otp.issue).toHaveBeenCalledWith(OtpPurpose.PASSWORD_CHANGE, USER_ID);
    expect(mail.sendOtp).toHaveBeenCalledWith('alex@u.nus.edu', '123456', OtpPurpose.PASSWORD_CHANGE);
    expect(result).toEqual({ otpExpiresAt: new Date('2026-09-28T10:05:00Z') });
  });

  it('mails MOBILE_CHANGE codes by email too — there is no other channel', async () => {
    const { service, mail } = build();

    await service.requestOtp(USER_ID, OtpPurpose.MOBILE_CHANGE);

    expect(mail.sendOtp).toHaveBeenCalledWith('alex@u.nus.edu', '123456', OtpPurpose.MOBILE_CHANGE);
  });

  it('propagates the 429 and issues nothing once the caller is rate-limited', async () => {
    const { service, otp, mail } = build();
    otp.assertWithinRequestLimit.mockRejectedValueOnce(
      new AppError(429, ErrorCode.RATE_LIMITED, 'Too many codes requested.'),
    );

    await expect(service.requestOtp(USER_ID, OtpPurpose.PASSWORD_CHANGE)).rejects.toMatchObject({
      code: ErrorCode.RATE_LIMITED,
    });
    expect(otp.issue).not.toHaveBeenCalled();
    expect(mail.sendOtp).not.toHaveBeenCalled();
  });

  describe('for DEACTIVATION', () => {
    it('refuses the sole active admin before issuing a code', async () => {
      const { service, otp, mail, users } = build();
      users.listUsers.mockResolvedValueOnce([userRecord({ id: ADMIN_ID, role: Role.ADMIN })]);

      await expect(service.requestOtp(ADMIN_ID, OtpPurpose.DEACTIVATION)).rejects.toMatchObject({
        status: 409,
        code: ErrorCode.LAST_ADMIN,
      });
      expect(otp.issue).not.toHaveBeenCalled();
      expect(mail.sendOtp).not.toHaveBeenCalled();
    });

    it('allows an admin who is not the only one', async () => {
      const { service, otp, users } = build();
      users.listUsers.mockResolvedValueOnce([
        userRecord({ id: ADMIN_ID, role: Role.ADMIN }),
        userRecord({ id: OTHER_ADMIN_ID, role: Role.ADMIN }),
      ]);

      await service.requestOtp(ADMIN_ID, OtpPurpose.DEACTIVATION);

      expect(otp.issue).toHaveBeenCalledWith(OtpPurpose.DEACTIVATION, ADMIN_ID);
    });

    it('never applies the last-admin check to a plain USER', async () => {
      const { service, otp, users } = build();
      users.listUsers.mockResolvedValueOnce([userRecord({ id: ADMIN_ID, role: Role.ADMIN })]);

      await service.requestOtp(USER_ID, OtpPurpose.DEACTIVATION);

      expect(otp.issue).toHaveBeenCalledWith(OtpPurpose.DEACTIVATION, USER_ID);
    });
  });
});

describe('requestEmailChange', () => {
  const NEW_EMAIL = 'alex.new@u.nus.edu';

  it('checks the EMAIL_CHANGE code, mails a NEW_EMAIL_VERIFY code, then spends the code', async () => {
    const { service, otp, mail, calls } = build();

    const result = await service.requestEmailChange(USER_ID, NEW_EMAIL, '123456');

    expect(otp.check).toHaveBeenCalledWith(OtpPurpose.EMAIL_CHANGE, USER_ID, '123456');
    expect(otp.issue).toHaveBeenCalledWith(
      OtpPurpose.NEW_EMAIL_VERIFY,
      USER_ID,
      expect.any(String),
    );
    expect(mail.sendOtp).toHaveBeenCalledWith(NEW_EMAIL, '123456', OtpPurpose.NEW_EMAIL_VERIFY);
    expect(otp.discard).toHaveBeenCalledWith(OtpPurpose.EMAIL_CHANGE, USER_ID);
    // Spent only after mailing succeeds, not before.
    expect(calls.indexOf('sendOtp')).toBeLessThan(calls.indexOf('discard'));
    expect(result).toEqual({ otpExpiresAt: new Date('2026-09-28T10:05:00Z') });
  });

  it('rejects an already-taken new address without spending the code', async () => {
    const { service, users, otp } = build();
    users.existsByEmailHash.mockResolvedValueOnce(true);

    await expect(service.requestEmailChange(USER_ID, NEW_EMAIL, '123456')).rejects.toMatchObject({
      status: 409,
      code: ErrorCode.EMAIL_TAKEN,
    });
    expect(otp.issue).not.toHaveBeenCalled();
    expect(otp.discard).not.toHaveBeenCalled();
  });

  it('counts the request against the rate limit before the EMAIL_TAKEN lookup', async () => {
    // Whether an address is taken is itself an account-enumeration oracle (same reasoning as
    // RegistrationService.register), so the number of times it can be asked has to be bounded.
    const { service, calls } = build();

    await service.requestEmailChange(USER_ID, NEW_EMAIL, '123456');

    expect(calls.indexOf('assertWithinRequestLimit')).toBeLessThan(
      calls.indexOf('existsByEmailHash'),
    );
  });

  it('checks the code even when the new address turns out to be taken, but never spends it', async () => {
    const { service, users, otp } = build();
    users.existsByEmailHash.mockResolvedValueOnce(true);

    await expect(service.requestEmailChange(USER_ID, NEW_EMAIL, '123456')).rejects.toMatchObject({
      code: ErrorCode.EMAIL_TAKEN,
    });
    expect(otp.check).toHaveBeenCalledWith(OtpPurpose.EMAIL_CHANGE, USER_ID, '123456');
    expect(otp.discard).not.toHaveBeenCalled();
  });

  it('never spends the code when mail fails, so the whole call can be retried', async () => {
    const { service, otp, mail } = build();
    mail.sendOtp.mockRejectedValueOnce(
      new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, 'Could not send the verification email.'),
    );

    await expect(service.requestEmailChange(USER_ID, NEW_EMAIL, '123456')).rejects.toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE,
    });
    expect(otp.discard).not.toHaveBeenCalled();
  });

  it('propagates a wrong or expired EMAIL_CHANGE code and mails nothing', async () => {
    const { service, otp, mail } = build();
    otp.check.mockRejectedValueOnce(
      new AppError(400, ErrorCode.OTP_INVALID, 'That code is not correct.', { attemptsRemaining: 2 }),
    );

    await expect(service.requestEmailChange(USER_ID, NEW_EMAIL, '000000')).rejects.toMatchObject({
      code: ErrorCode.OTP_INVALID,
    });
    expect(mail.sendOtp).not.toHaveBeenCalled();
  });

  it('never reaches the EMAIL_TAKEN check without a real, live code', async () => {
    // The whole point of checking the code first: a valid access token alone must not be
    // enough to probe EMAIL_TAKEN.
    const { service, otp, users } = build();
    otp.check.mockRejectedValueOnce(
      new AppError(400, ErrorCode.OTP_EXPIRED, 'That code has expired. Please request a new one.'),
    );

    await expect(service.requestEmailChange(USER_ID, NEW_EMAIL, '000000')).rejects.toMatchObject({
      code: ErrorCode.OTP_EXPIRED,
    });
    expect(users.existsByEmailHash).not.toHaveBeenCalled();
  });
});

describe('verifyEmailChange', () => {
  const NEW_EMAIL = 'alex.new@u.nus.edu';

  it('commits the new email and returns the refreshed self profile', async () => {
    const { service, otp, users } = build();
    otp.verify.mockResolvedValueOnce(encrypt(NEW_EMAIL).toString('base64'));
    users.findById.mockResolvedValueOnce(userRecord({ emailEncrypted: encrypt(NEW_EMAIL) }));

    const result = await service.verifyEmailChange(USER_ID, '123456');

    expect(otp.verify).toHaveBeenCalledWith(OtpPurpose.NEW_EMAIL_VERIFY, USER_ID, '123456');
    expect(users.updateEmail).toHaveBeenCalledWith(
      USER_ID,
      expect.stringMatching(/^[0-9a-f]{64}$/),
      expect.any(Buffer),
    );
    expect(result.email).toBe(NEW_EMAIL);
  });

  it('reuses the stored ciphertext rather than re-encrypting the address', async () => {
    const { service, otp, users } = build();
    const stored = encrypt(NEW_EMAIL);
    otp.verify.mockResolvedValueOnce(stored.toString('base64'));

    await service.verifyEmailChange(USER_ID, '123456');

    expect(users.updateEmail.mock.calls[0][2]).toEqual(stored);
  });

  it('surfaces a race against the same address as 409 EMAIL_TAKEN', async () => {
    const { service, otp, users } = build();
    otp.verify.mockResolvedValueOnce(encrypt(NEW_EMAIL).toString('base64'));
    users.updateEmail.mockRejectedValueOnce(
      new AppError(409, ErrorCode.EMAIL_TAKEN, 'An account with this email already exists.'),
    );

    await expect(service.verifyEmailChange(USER_ID, '123456')).rejects.toMatchObject({
      code: ErrorCode.EMAIL_TAKEN,
    });
  });
});

describe('changeMobile', () => {
  it('verifies the MOBILE_CHANGE code and stores the digits only', async () => {
    const { service, otp, users } = build();

    const result = await service.changeMobile(USER_ID, '+65', '98765432', '123456');

    expect(otp.verify).toHaveBeenCalledWith(OtpPurpose.MOBILE_CHANGE, USER_ID, '123456');
    expect(users.updateMobile).toHaveBeenCalledWith(USER_ID, '+65', expect.any(Buffer));
    expect(result.userId).toBe(USER_ID);
  });

  it('changes nothing when the code is wrong', async () => {
    const { service, otp, users } = build();
    otp.verify.mockRejectedValueOnce(
      new AppError(400, ErrorCode.OTP_INVALID, 'That code is not correct.'),
    );

    await expect(service.changeMobile(USER_ID, '+65', '98765432', '000000')).rejects.toMatchObject({
      code: ErrorCode.OTP_INVALID,
    });
    expect(users.updateMobile).not.toHaveBeenCalled();
  });
});

describe('changePassword', () => {
  const NEW_PASSWORD = 'N3wPassword';

  function activeUser(overrides: Partial<UserRecord> = {}): UserRecord {
    return userRecord({ passwordHash: currentHash, ...overrides });
  }

  it('sets the new password, revokes every session, then spends the code', async () => {
    const { service, otp, users, refreshTokens, statements, calls } = build();

    await service.changePassword(USER_ID, '123456', NEW_PASSWORD);

    expect(users.updatePasswordHash).toHaveBeenCalledWith(USER_ID, expect.any(String), expect.anything());
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(USER_ID, expect.anything());
    expect(statements).toEqual(['BEGIN', 'COMMIT']);
    expect(calls.indexOf('sql:BEGIN')).toBeLessThan(calls.indexOf('updatePasswordHash'));
    expect(calls.indexOf('revokeAllForUser')).toBeLessThan(calls.indexOf('sql:COMMIT'));
    // Spent only after the transaction commits, not before.
    expect(otp.discard).toHaveBeenCalledWith(OtpPurpose.PASSWORD_CHANGE, USER_ID);
    expect(calls.indexOf('sql:COMMIT')).toBeLessThan(calls.indexOf('discard'));
  });

  it('rejects a new password that matches the current one, without spending the code', async () => {
    const { service, users, otp } = build();
    users.findById.mockResolvedValueOnce(activeUser());

    await expect(
      service.changePassword(USER_ID, '123456', 'Passw0rdSafe'),
    ).rejects.toMatchObject({ status: 400, code: ErrorCode.VALIDATION_ERROR });
    expect(users.updatePasswordHash).not.toHaveBeenCalled();
    expect(otp.discard).not.toHaveBeenCalled();
  });

  it('skips the reuse check when the account has no password yet', async () => {
    const { service, users } = build();
    users.findById.mockResolvedValueOnce(userRecord({ passwordHash: null }));

    await service.changePassword(USER_ID, '123456', NEW_PASSWORD);

    expect(users.updatePasswordHash).toHaveBeenCalled();
  });

  it('checks the code before touching the database', async () => {
    const { service, calls } = build();

    await service.changePassword(USER_ID, '123456', NEW_PASSWORD);

    expect(calls.indexOf('check')).toBeLessThan(calls.indexOf('findById'));
  });

  it('leaves the code spendable when the transaction fails, rather than burning it', async () => {
    const { service, users, otp } = build();
    users.updatePasswordHash.mockRejectedValueOnce(new Error('connection lost'));

    await expect(service.changePassword(USER_ID, '123456', NEW_PASSWORD)).rejects.toThrow(
      'connection lost',
    );
    expect(otp.discard).not.toHaveBeenCalled();
  });

  it('changes nothing when the code is wrong', async () => {
    const { service, otp, users, refreshTokens } = build();
    otp.check.mockRejectedValueOnce(
      new AppError(400, ErrorCode.OTP_INVALID, 'That code is not correct.', { attemptsRemaining: 2 }),
    );

    await expect(service.changePassword(USER_ID, '000000', NEW_PASSWORD)).rejects.toMatchObject({
      code: ErrorCode.OTP_INVALID,
    });
    expect(users.updatePasswordHash).not.toHaveBeenCalled();
    expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('never reaches the reuse check without a real, live code', async () => {
    // The whole point of checking the code first: a valid access token alone must not be
    // enough to probe whether a guess matches the account's real password.
    const { service, otp, users } = build();
    otp.check.mockRejectedValueOnce(
      new AppError(400, ErrorCode.OTP_EXPIRED, 'That code has expired. Please request a new one.'),
    );

    await expect(service.changePassword(USER_ID, '000000', NEW_PASSWORD)).rejects.toMatchObject({
      code: ErrorCode.OTP_EXPIRED,
    });
    expect(users.findById).not.toHaveBeenCalled();
  });
});

describe('deactivateSelf', () => {
  it('deactivates the account and revokes every session, inside the last-admin lock', async () => {
    const { service, users, refreshTokens, lock } = build([USER_ID, OTHER_ADMIN_ID]);

    await service.deactivateSelf(USER_ID, '123456');

    expect(lock.run).toHaveBeenCalledWith(USER_ID, expect.any(Function));
    expect(users.deactivate).toHaveBeenCalledWith(USER_ID, expect.anything());
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(USER_ID, expect.anything());
  });

  it('refuses the sole active admin', async () => {
    const { service, users, refreshTokens } = build([USER_ID]);

    await expect(service.deactivateSelf(USER_ID, '123456')).rejects.toMatchObject({
      status: 409,
      code: ErrorCode.LAST_ADMIN,
    });
    expect(users.deactivate).not.toHaveBeenCalled();
    expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('never applies the last-admin check to a plain USER (activeAdminIds is null)', async () => {
    const { service, users } = build(null);

    await service.deactivateSelf(USER_ID, '123456');

    expect(users.deactivate).toHaveBeenCalledWith(USER_ID, expect.anything());
  });

  it('consumes the OTP before the lock even opens', async () => {
    const { service, calls } = build([USER_ID, OTHER_ADMIN_ID]);

    await service.deactivateSelf(USER_ID, '123456');

    expect(calls.indexOf('verify')).toBeLessThan(calls.indexOf('lock.run'));
  });

  it('changes nothing when the code is wrong', async () => {
    const { service, otp, users, lock } = build([USER_ID, OTHER_ADMIN_ID]);
    otp.verify.mockRejectedValueOnce(
      new AppError(400, ErrorCode.OTP_INVALID, 'That code is not correct.'),
    );

    await expect(service.deactivateSelf(USER_ID, '000000')).rejects.toMatchObject({
      code: ErrorCode.OTP_INVALID,
    });
    expect(lock.run).not.toHaveBeenCalled();
    expect(users.deactivate).not.toHaveBeenCalled();
  });
});
