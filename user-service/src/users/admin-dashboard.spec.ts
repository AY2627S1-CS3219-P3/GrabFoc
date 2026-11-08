/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-02
 * Scope: Generated unit tests for #180: which login attempts are recorded, the suspend body,
 *   and ADMIN-only access to the new routes. Database, Redis and tokens are stubbed.
 * Author review: Reviewed by Zi Yi, 2026-11-05.
 */
// AI-generated (reviewed by Zi Yi)
import { Reflector } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { Role } from '../common/enums/role.enum';
import { UserStatus } from '../common/enums/user-status.enum';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { LoginOutcome } from './login-events.repository';
import { UsersAdminController } from './users-admin.controller';

const USER_ID = 'cccccccc-0000-4000-8000-000000000003';
const tx = { tag: 'tx' };

function makeAuth(opts: {
  user?: { status: UserStatus } | null;
  correct?: boolean;
  lockTtl?: number;
  locksNow?: boolean;
  recordFails?: boolean;
}) {
  const user =
    opts.user === null
      ? null
      : {
          id: USER_ID,
          displayName: 'Bob',
          role: Role.USER,
          status: UserStatus.ACTIVE,
          ...opts.user,
        };
  const usersService = {
    findByEmailHash: vi.fn(async () => user),
    recordLogin: vi.fn(async () => {
      if (opts.recordFails) throw new Error('insert failed');
    }),
  };
  const tokens = {
    issue: vi.fn(async () => ({ accessToken: 'a', refreshToken: 'r' })),
  };
  const otp = {
    hashEmail: () => 'h',
    verifyPassword: vi.fn(async () => opts.correct ?? false),
  };
  const redis = {
    getLoginLockTtl: vi.fn(async () => opts.lockTtl ?? 0),
    recordLoginFailure: vi.fn(async () => ({
      locked: opts.locksNow ?? false,
      retryAfterSeconds: 900,
    })),
    clearLoginFailures: vi.fn(),
  };
  const db = {
    transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  const service = new AuthService(
    usersService as never,
    tokens as never,
    otp as never,
    redis as never,
    {} as never,
    db as never,
    {} as never,
  );
  return { service, usersService, tokens };
}

const login = { email: 'bob@u.nus.edu', password: 'whatever' };

describe('login recording (#180)', () => {
  it.each([
    [
      'a wrong password',
      { correct: false },
      LoginOutcome.WRONG_PASSWORD,
      'INVALID_CREDENTIALS',
    ],
    [
      'the wrong password that starts the lock',
      { correct: false, locksNow: true },
      LoginOutcome.LOCKED,
      'ACCOUNT_LOCKED',
    ],
    [
      'a deactivated account',
      { correct: true, user: { status: UserStatus.DEACTIVATED } },
      LoginOutcome.DEACTIVATED,
      'ACCOUNT_DEACTIVATED',
    ],
    [
      'a suspended account',
      { correct: true, user: { status: UserStatus.SUSPENDED } },
      LoginOutcome.SUSPENDED,
      'ACCOUNT_SUSPENDED',
    ],
  ] as const)(
    'records %s and answers as before',
    async (_, opts, outcome, code) => {
      const { service, usersService } = makeAuth(opts);
      await expect(service.login(login)).rejects.toMatchObject({ code });
      expect(usersService.recordLogin).toHaveBeenCalledTimes(1);
      expect(usersService.recordLogin).toHaveBeenCalledWith(USER_ID, outcome);
    },
  );

  it('records a success in the same transaction as the session', async () => {
    const { service, usersService, tokens } = makeAuth({ correct: true });
    await expect(service.login(login)).resolves.toMatchObject({
      user: { userId: USER_ID },
    });
    expect(usersService.recordLogin).toHaveBeenCalledWith(
      USER_ID,
      LoginOutcome.SUCCESS,
      tx,
    );
    expect(tokens.issue).toHaveBeenCalledWith(
      expect.objectContaining({ id: USER_ID }),
      tx,
    );
  });

  it.each([
    ['an unknown email', { user: null }, 'INVALID_CREDENTIALS'],
    ['an attempt while already locked', { lockTtl: 600 }, 'ACCOUNT_LOCKED'],
  ] as const)('records nothing for %s', async (_, opts, code) => {
    const { service, usersService } = makeAuth(opts);
    await expect(service.login(login)).rejects.toMatchObject({ code });
    expect(usersService.recordLogin).not.toHaveBeenCalled();
  });

  it.each([
    ['a wrong password', { correct: false }],
    ['a correct password', { correct: true }],
  ])('fails the login when the insert fails, on %s', async (_, opts) => {
    const { service } = makeAuth({ ...opts, recordFails: true });
    await expect(service.login(login)).rejects.toThrow('insert failed');
  });
});

describe('suspend body (#180)', () => {
  const pipe = new ZodValidationPipe();
  const validate = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: SuspendUserDto });

  it.each([
    ['a missing body', undefined],
    ['no reason', {}],
    ['an empty reason', { reason: '' }],
    ['a blank reason', { reason: '   ' }],
    ['a reason over 500 characters', { reason: 'x'.repeat(501) }],
    ['an unknown field', { reason: 'ok', note: 'x' }],
  ])('rejects %s with a 400', (_, body) => {
    expect(() => validate(body)).toThrow(
      expect.objectContaining({ status: 400 }),
    );
  });

  it('trims the reason and accepts 500 characters', () => {
    expect(validate({ reason: '  No-shows  ' })).toEqual({
      reason: 'No-shows',
    });
    expect(validate({ reason: 'x'.repeat(500) })).toEqual({
      reason: 'x'.repeat(500),
    });
  });
});

describe('new admin routes (#180)', () => {
  const guard = new AuthGuard(new Reflector(), {
    verifyAccessToken: async () => ({ sub: USER_ID, role: Role.USER }),
  } as never);

  it.each([
    'loginSummary',
    'listLoginEvents',
    'reactivate',
    'suspend',
  ] as const)('refuses a USER on %s with 403', async (handler) => {
    const context = {
      getHandler: () => UsersAdminController.prototype[handler],
      getClass: () => UsersAdminController,
      switchToHttp: () => ({
        getRequest: () => ({ header: () => 'Bearer t' }),
      }),
    };
    await expect(guard.canActivate(context as never)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
  });
});
