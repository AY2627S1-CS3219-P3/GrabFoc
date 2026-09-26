/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-26
 * Scope: Generated the login tests, one per numbered rule under "Login" in AGENTS.md, with
 *        fake repository, lockout and session collaborators.
 * Author review: Read in full; the indistinguishability and ordering assertions were each
 *                confirmed to fail against a deliberately broken version of the service.
 */
import { AppError } from '../common/app-error';
import { ErrorCode } from '../common/error-codes';
import { DUMMY_PASSWORD_HASH, hashPassword } from '../crypto';
import { UserRecord, UserStatus, UsersRepository } from '../users/users.repository';
import { Role } from './caller';
import { LockoutService } from './lockout.service';
import { LoginService } from './login.service';
import { AuthResponse, SessionService } from './session.service';

const PASSWORD = 'Passw0rdSafe';
const INPUT = { email: 'alex@u.nus.edu', password: PASSWORD };

/** Hashed once: bcrypt at cost 12 takes ~250ms, and every test here needs the same hash. */
let passwordHash: string;
beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

function activeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    displayName: 'Alex Tan',
    passwordHash,
    role: Role.USER,
    status: UserStatus.ACTIVE,
    ...overrides,
  } as UserRecord;
}

function build(user: UserRecord | null = activeUser()) {
  const calls: string[] = [];
  const record = (name: string) => calls.push(name);

  const users = {
    findByEmailHash: jest.fn<Promise<UserRecord | null>, [string]>(async () => {
      record('findByEmailHash');
      return user;
    }),
  };

  const lockout = {
    assertNotLocked: jest.fn<Promise<void>, [string]>(async () => {
      record('assertNotLocked');
    }),
    recordFailure: jest.fn<Promise<AppError>, [string]>(async () => {
      record('recordFailure');
      return new AppError(401, ErrorCode.INVALID_CREDENTIALS, 'Email or password is incorrect.');
    }),
    clearFailures: jest.fn<Promise<void>, [string]>(async () => {
      record('clearFailures');
    }),
  };

  const sessions = {
    issue: jest.fn<Promise<AuthResponse>, [unknown]>(async () => {
      record('issue');
      return { accessToken: 'a', refreshToken: 'r' } as AuthResponse;
    }),
  };

  const service = new LoginService(
    users as unknown as UsersRepository,
    lockout as unknown as LockoutService,
    sessions as unknown as SessionService,
  );

  return { service, users, lockout, sessions, calls };
}

describe('the happy path', () => {
  it('returns a session for the right password', async () => {
    const { service, sessions } = build();

    await expect(service.login(INPUT)).resolves.toMatchObject({ accessToken: 'a' });
    expect(sessions.issue).toHaveBeenCalled();
  });

  it('clears the failure counter, so it takes five CONSECUTIVE failures', async () => {
    const { service, lockout } = build();

    await service.login(INPUT);

    expect(lockout.clearFailures).toHaveBeenCalled();
  });

  it('looks the account up by hash, never by address', async () => {
    const { service, users } = build();

    await service.login(INPUT);

    expect(users.findByEmailHash.mock.calls[0][0]).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('step 1: a locked account is refused first', () => {
  it('rejects before touching the database or bcrypt', async () => {
    // Most of the value of a lockout is that a locked account costs nothing to refuse.
    const { service, users, lockout } = build();
    lockout.assertNotLocked.mockRejectedValueOnce(
      new AppError(423, ErrorCode.ACCOUNT_LOCKED, 'Too many failed attempts.', {
        retryAfterSeconds: 840,
      }),
    );

    await expect(service.login(INPUT)).rejects.toMatchObject({
      status: 423,
      code: ErrorCode.ACCOUNT_LOCKED,
      details: { retryAfterSeconds: 840 },
    });
    expect(users.findByEmailHash).not.toHaveBeenCalled();
  });

  it('checks the lock before anything else', async () => {
    const { service, calls } = build();

    await service.login(INPUT);

    expect(calls[0]).toBe('assertNotLocked');
  });
});

describe('step 2: an unknown address is indistinguishable from a wrong password', () => {
  it('answers the same for both', async () => {
    const unknown = await build(null).service.login(INPUT).catch((e) => e);
    const wrongPassword = await build()
      .service.login({ ...INPUT, password: 'Wr0ngPassword' })
      .catch((e) => e);

    expect(unknown.getStatus()).toBe(wrongPassword.getStatus());
    expect(unknown.code).toBe(wrongPassword.code);
    expect(unknown.message).toBe(wrongPassword.message);
  });

  it('still pays for a bcrypt comparison when there is no account', async () => {
    // Skipping it would return in a millisecond instead of ~250, and that gap alone says
    // whether the address is registered.
    const { service } = build(null);

    const started = Date.now();
    await service.login(INPUT).catch(() => undefined);

    expect(Date.now() - started).toBeGreaterThan(50);
  });

  it('counts an unknown address against the lockout too', async () => {
    // Otherwise "this address never locks out" is itself the answer to "does it exist?".
    const { service, lockout } = build(null);

    await service.login(INPUT).catch(() => undefined);

    expect(lockout.recordFailure).toHaveBeenCalled();
  });

  it('treats a NULL password hash as a wrong password, not as a match', async () => {
    // The bootstrap admin before it is claimed. `verifyPassword` against the dummy hash must
    // never succeed, whatever is submitted.
    const { service, sessions } = build(activeUser({ passwordHash: null }));

    await expect(service.login(INPUT)).rejects.toMatchObject({
      code: ErrorCode.INVALID_CREDENTIALS,
    });
    expect(sessions.issue).not.toHaveBeenCalled();
    expect(DUMMY_PASSWORD_HASH).toMatch(/^\$2[aby]\$12\$/);
  });
});

describe('step 3: failures are counted', () => {
  it('counts a wrong password and issues no session', async () => {
    const { service, lockout, sessions } = build();

    await expect(service.login({ ...INPUT, password: 'Wr0ngPassword' })).rejects.toMatchObject({
      status: 401,
      code: ErrorCode.INVALID_CREDENTIALS,
    });
    expect(lockout.recordFailure).toHaveBeenCalled();
    expect(sessions.issue).not.toHaveBeenCalled();
  });

  it('surfaces the 423 the lockout produces on the fifth failure', async () => {
    const { service, lockout } = build();
    lockout.recordFailure.mockResolvedValueOnce(
      new AppError(423, ErrorCode.ACCOUNT_LOCKED, 'Too many failed attempts.', {
        retryAfterSeconds: 900,
      }),
    );

    await expect(service.login({ ...INPUT, password: 'Wr0ngPassword' })).rejects.toMatchObject({
      status: 423,
      details: { retryAfterSeconds: 900 },
    });
  });

  it('does not clear the counter on a failure', async () => {
    const { service, lockout } = build();

    await service.login({ ...INPUT, password: 'Wr0ngPassword' }).catch(() => undefined);

    expect(lockout.clearFailures).not.toHaveBeenCalled();
  });
});

describe('step 4: status is revealed only after a correct password', () => {
  it.each([
    [UserStatus.DEACTIVATED, ErrorCode.ACCOUNT_DEACTIVATED],
    [UserStatus.SUSPENDED, ErrorCode.ACCOUNT_SUSPENDED],
  ])('rejects a %s account with 403 %s', async (status, code) => {
    const { service, sessions } = build(activeUser({ status }));

    await expect(service.login(INPUT)).rejects.toMatchObject({ status: 403, code });
    expect(sessions.issue).not.toHaveBeenCalled();
  });

  it.each([[UserStatus.DEACTIVATED], [UserStatus.SUSPENDED]])(
    'hides a %s account behind a wrong password',
    async (status) => {
      // The whole point of checking status last: without the password, a deactivated account
      // must look exactly like one that does not exist.
      const { service } = build(activeUser({ status }));

      await expect(
        service.login({ ...INPUT, password: 'Wr0ngPassword' }),
      ).rejects.toMatchObject({ status: 401, code: ErrorCode.INVALID_CREDENTIALS });
    },
  );

  it('checks the password before the status', async () => {
    const { service, calls } = build(activeUser({ status: UserStatus.DEACTIVATED }));

    await service.login(INPUT).catch(() => undefined);

    // A correct password got as far as clearing the counter; the 403 came after.
    expect(calls).toContain('clearFailures');
  });
});
