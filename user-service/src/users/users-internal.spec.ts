/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-02
 * Scope: Generated unit tests for GET /internal/users/:userId/contact (#151): the service-key guard,
 *        the route's guards, and the email lookup, with the database stubbed.
 * Author review: pending — Jie Yang to record the review; Deanson / Zi Yi (User owners) to review.
 */
// AI-generated (pending review)
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { UserStatus } from '../common/enums/user-status.enum';
import { AppError } from '../common/errors/app-error';
import { ErrorCode } from '../common/errors/error-codes';
import { keysMatch, ServiceKeyGuard } from '../common/guards/service-key.guard';
import { UsersInternalController } from './users-internal.controller';
import { UsersService } from './users.service';

const KEY = 'k'.repeat(64);
const USER = 'bbbbbbbb-0000-4000-8000-000000000002';

function contextWith(headers: Record<string, string>): ExecutionContext {
  const request = { header: (name: string) => headers[name.toLowerCase()] };
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}
const guard = new ServiceKeyGuard({ get: () => KEY } as never);

function expectError(fn: () => unknown, status: number, code: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).getStatus()).toBe(status);
    expect((err as AppError).code).toBe(code);
    return;
  }
  throw new Error('expected an error');
}

describe('ServiceKeyGuard', () => {
  it('lets the right key through', () => {
    expect(guard.canActivate(contextWith({ 'x-service-key': KEY }))).toBe(true);
  });

  it.each([
    ['no key', {}],
    ['a wrong key', { 'x-service-key': 'x'.repeat(64) }],
    ['a key of a different length', { 'x-service-key': 'short' }],
    ['only a user token', { authorization: 'Bearer some.user.token' }],
  ])('rejects %s with 401', (_name, headers) => {
    expectError(() => guard.canActivate(contextWith(headers)), 401, ErrorCode.SERVICE_KEY_INVALID);
  });

  it('compares keys of different lengths without throwing', () => {
    expect(keysMatch('a', 'bb')).toBe(false);
  });
});

describe('UsersInternalController', () => {
  it('is mounted at /internal/users, skips the user-token guard and requires the service key', () => {
    expect(Reflect.getMetadata(PATH_METADATA, UsersInternalController)).toBe('internal/users');
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, UsersInternalController)).toBe(true);
    expect(Reflect.getMetadata(GUARDS_METADATA, UsersInternalController)).toEqual([ServiceKeyGuard]);
  });
});

describe('getContactEmail', () => {
  function makeService(row: { emailEncrypted: Buffer; status: UserStatus } | null) {
    const users = { findById: vi.fn(async () => row) };
    const otp = { decrypt: vi.fn(() => 'e0000000@u.nus.edu') };
    const service = new UsersService(
      users as never,
      {} as never,
      {} as never,
      {} as never,
      otp as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never, // LoginEventsRepository (#180)
    );
    return { service, users, otp };
  }

  it.each([UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.DEACTIVATED])(
    'returns the decrypted email of a %s user',
    async (status) => {
      const encrypted = Buffer.from('cipher');
      const { service, users, otp } = makeService({ emailEncrypted: encrypted, status });
      await expect(service.getContactEmail(USER)).resolves.toEqual({ email: 'e0000000@u.nus.edu' });
      expect(users.findById).toHaveBeenCalledWith(USER);
      expect(otp.decrypt).toHaveBeenCalledWith(encrypted);
    },
  );

  it('returns 404 for an unknown user, without the email in the error', async () => {
    const { service } = makeService(null);
    const err = await service.getContactEmail(USER).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).getStatus()).toBe(404);
    expect((err as AppError).code).toBe(ErrorCode.NOT_FOUND);
  });
});
