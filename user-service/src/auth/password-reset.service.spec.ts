/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-26
 * Scope: Generated the forgot / reset tests against fake OTP, mail, repository and lockout
 *        collaborators, including the ones that pin the enumeration-resistance rules.
 * Author review: Read in full; each enumeration and ordering assertion was confirmed to fail
 *                against a deliberately broken version of the service.
 */
import { Pool, PoolClient } from 'pg';
import { AppError } from '../common/app-error';
import { ErrorCode } from '../common/error-codes';
import { OtpPurpose, hashPassword } from '../crypto';
import { MailService } from '../mail/mail.service';
import { IssuedOtp, OtpService } from '../otp/otp.service';
import { UserRecord, UserStatus, UsersRepository } from '../users/users.repository';
import { ForgotPasswordInput, ResetPasswordInput } from './auth.schemas';
import { Role } from './caller';
import { LockoutService } from './lockout.service';
import { PasswordResetService } from './password-reset.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';

const EMAIL = 'alex@u.nus.edu';
const FORGOT: ForgotPasswordInput = { email: EMAIL };
const RESET: ResetPasswordInput = { email: EMAIL, otp: '123456', newPassword: 'N3wPassword' };

const USER_ID = '11111111-1111-4111-8111-111111111111';

/** The current password, hashed once so every test that needs it shares the cost. */
let currentHash: string;

beforeAll(async () => {
  currentHash = await hashPassword('Passw0rdSafe');
});

function activeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: USER_ID,
    displayName: 'Alex Tan',
    role: Role.USER,
    status: UserStatus.ACTIVE,
    passwordHash: currentHash,
    ...overrides,
  } as UserRecord;
}

function build(user: UserRecord | null = activeUser()) {
  const calls: string[] = [];
  const record = (name: string) => calls.push(name);

  const users = {
    findByEmailHash: jest.fn<Promise<UserRecord | null>, [string, PoolClient?]>(async () => {
      record('findByEmailHash');
      return user;
    }),
    updatePasswordHash: jest.fn<Promise<boolean>, [string, string, PoolClient?]>(async () => {
      record('updatePasswordHash');
      return true;
    }),
  };

  const otp = {
    assertWithinRequestLimit: jest.fn<Promise<void>, [string]>(async () => {
      record('assertWithinRequestLimit');
    }),
    issue: jest.fn<Promise<IssuedOtp>, [OtpPurpose, string, string?]>(async () => {
      record('issue');
      return { code: '123456', expiresAt: new Date('2026-09-26T10:05:00Z') };
    }),
    verify: jest.fn<Promise<string | undefined>, [OtpPurpose, string, string]>(async () => {
      record('verify');
      return undefined;
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
      return 3;
    }),
  };

  const lockout = {
    clear: jest.fn<Promise<void>, [string]>(async () => {
      record('lockout.clear');
    }),
  };

  // `withTransaction` checks out one client and wraps the work in BEGIN/COMMIT. Recording the
  // statements is how these tests see whether the two writes committed together.
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

  const service = new PasswordResetService(
    users as unknown as UsersRepository,
    otp as unknown as OtpService,
    mail as unknown as MailService,
    refreshTokens as unknown as RefreshTokensRepository,
    lockout as unknown as LockoutService,
    pool as unknown as Pool,
  );

  return { service, users, otp, mail, refreshTokens, lockout, calls, statements, client };
}

describe('forgot', () => {
  it('mails a reset code to an active account', async () => {
    const { service, otp, mail } = build();

    await service.forgot(FORGOT);

    expect(otp.issue).toHaveBeenCalledWith(OtpPurpose.PASSWORD_RESET, expect.any(String));
    expect(mail.sendOtp).toHaveBeenCalledWith(EMAIL, '123456', OtpPurpose.PASSWORD_RESET);
    // The subject is the email hash, never the address (AGENTS.md, "Redis keys").
    expect(otp.issue.mock.calls[0][1]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('resolves without mailing anything when no account exists', async () => {
    const { service, mail } = build(null);

    // No throw, no 404, nothing for the caller to read a meaning into.
    await expect(service.forgot(FORGOT)).resolves.toBeUndefined();
    expect(mail.sendOtp).not.toHaveBeenCalled();
  });

  it('still writes an OTP record when no account exists', async () => {
    // The decoy is the whole reason reset can answer identically for a known and an unknown
    // address: without a record, reset would say "expired" for an unknown address and "wrong
    // code" for a known one, which is an account-enumeration oracle needing no guessing at all.
    const { service, otp } = build(null);

    await service.forgot(FORGOT);

    expect(otp.issue).toHaveBeenCalledWith(OtpPurpose.PASSWORD_RESET, expect.any(String));
  });

  it.each([UserStatus.DEACTIVATED, UserStatus.SUSPENDED])(
    'sends no code to a %s account',
    async (status) => {
      // Otherwise deactivation would be reversible by the person it was applied to.
      const { service, mail, otp } = build(activeUser({ status }));

      await service.forgot(FORGOT);

      expect(mail.sendOtp).not.toHaveBeenCalled();
      // The decoy is still written, so this is indistinguishable from an address with no account.
      expect(otp.issue).toHaveBeenCalled();
    },
  );

  it('counts the request against the rate limit BEFORE looking the email up', async () => {
    // An address with no account must be limited exactly like one that has, or never being
    // blocked would itself reveal that there is nothing there.
    const { service, calls } = build();

    await service.forgot(FORGOT);

    expect(calls.indexOf('assertWithinRequestLimit')).toBeLessThan(
      calls.indexOf('findByEmailHash'),
    );
  });

  it('propagates the 429 and does nothing else once blocked', async () => {
    const { service, otp, users, mail } = build();
    otp.assertWithinRequestLimit.mockRejectedValueOnce(
      new AppError(429, ErrorCode.RATE_LIMITED, 'Too many codes requested.'),
    );

    await expect(service.forgot(FORGOT)).rejects.toMatchObject({ code: ErrorCode.RATE_LIMITED });
    expect(users.findByEmailHash).not.toHaveBeenCalled();
    expect(otp.issue).not.toHaveBeenCalled();
    expect(mail.sendOtp).not.toHaveBeenCalled();
  });

  it('swallows a mail failure rather than turning it into a 503', async () => {
    // A 503 could only ever happen for an address that HAS an account, so letting it through
    // would answer the question the uniform 202 exists to refuse. AGENTS.md lists 429 as the
    // only error this endpoint returns.
    const { service, mail } = build();
    mail.sendOtp.mockRejectedValueOnce(
      new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, 'Could not send the verification email.'),
    );

    await expect(service.forgot(FORGOT)).resolves.toBeUndefined();
  });
});

describe('reset', () => {
  it('sets the new password and revokes every session, in one transaction', async () => {
    const { service, users, refreshTokens, statements, calls } = build();

    await service.reset(RESET);

    expect(users.updatePasswordHash).toHaveBeenCalledWith(
      USER_ID,
      expect.any(String),
      expect.anything(),
    );
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(USER_ID, expect.anything());
    expect(statements).toEqual(['BEGIN', 'COMMIT']);
    // Both writes are inside the transaction, not either side of it.
    expect(calls.indexOf('sql:BEGIN')).toBeLessThan(calls.indexOf('updatePasswordHash'));
    expect(calls.indexOf('revokeAllForUser')).toBeLessThan(calls.indexOf('sql:COMMIT'));
  });

  it('stores a bcrypt hash, never the password itself', async () => {
    const { service, users } = build();

    await service.reset(RESET);

    const stored = users.updatePasswordHash.mock.calls[0][1];
    expect(stored).toMatch(/^\$2[aby]\$12\$/);
    expect(stored).not.toContain(RESET.newPassword);
  });

  it('consumes the code before touching the database', async () => {
    // Looking the user up first would let a caller with no code learn whether an address exists
    // by timing the response.
    const { service, calls } = build();

    await service.reset(RESET);

    expect(calls.indexOf('verify')).toBeLessThan(calls.indexOf('findByEmailHash'));
  });

  it('verifies the code under PASSWORD_RESET and the email hash', async () => {
    const { service, otp } = build();

    await service.reset(RESET);

    expect(otp.verify).toHaveBeenCalledWith(
      OtpPurpose.PASSWORD_RESET,
      expect.any(String),
      '123456',
    );
    expect(otp.verify.mock.calls[0][1]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes nothing when the code is wrong', async () => {
    const { service, otp, users, refreshTokens, lockout } = build();
    otp.verify.mockRejectedValueOnce(
      new AppError(400, ErrorCode.OTP_INVALID, 'That code is not correct.', {
        attemptsRemaining: 2,
      }),
    );

    await expect(service.reset(RESET)).rejects.toMatchObject({ code: ErrorCode.OTP_INVALID });
    expect(users.updatePasswordHash).not.toHaveBeenCalled();
    expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
    expect(lockout.clear).not.toHaveBeenCalled();
  });

  it('rejects a new password that matches the current one', async () => {
    const { service, users, refreshTokens } = build();

    await expect(
      service.reset({ ...RESET, newPassword: 'Passw0rdSafe' }),
    ).rejects.toMatchObject({ status: 400, code: ErrorCode.VALIDATION_ERROR });
    expect(users.updatePasswordHash).not.toHaveBeenCalled();
    expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('skips the reuse check when the account has no password yet', async () => {
    // The bootstrap admin claiming its account: `password_hash` is NULL, so there is no current
    // password for the new one to differ from, and bcrypt would throw on a null hash.
    const { service, users } = build(activeUser({ passwordHash: null }));

    await service.reset(RESET);

    expect(users.updatePasswordHash).toHaveBeenCalled();
  });

  it('lifts the lockout, after the commit', async () => {
    // Forgetting a password is the normal way to get locked out, so a reset that left the lock
    // standing would still refuse the password it had just set, for up to fifteen minutes.
    const { service, lockout, calls } = build();

    await service.reset(RESET);

    expect(lockout.clear).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f]{64}$/));
    expect(calls.indexOf('sql:COMMIT')).toBeLessThan(calls.indexOf('lockout.clear'));
  });

  it('does not lift the lockout when the write rolls back', async () => {
    const { service, users, lockout, statements } = build();
    users.updatePasswordHash.mockRejectedValueOnce(new Error('connection lost'));

    await expect(service.reset(RESET)).rejects.toThrow('connection lost');
    expect(statements).toEqual(['BEGIN', 'ROLLBACK']);
    expect(lockout.clear).not.toHaveBeenCalled();
  });

  it.each([UserStatus.DEACTIVATED, UserStatus.SUSPENDED])(
    'refuses a %s account with the same wording as a wrong code',
    async (status) => {
      const { service, users } = build(activeUser({ status }));

      await expect(service.reset(RESET)).rejects.toMatchObject({
        status: 400,
        code: ErrorCode.OTP_INVALID,
      });
      expect(users.updatePasswordHash).not.toHaveBeenCalled();
    },
  );

  it('refuses an address with no account with the same wording as a wrong code', async () => {
    const { service, users } = build(null);

    await expect(service.reset(RESET)).rejects.toMatchObject({
      status: 400,
      code: ErrorCode.OTP_INVALID,
    });
    expect(users.updatePasswordHash).not.toHaveBeenCalled();
  });
});
