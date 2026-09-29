/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Sonnet 5), date: 2026-09-27
 * Scope: Generated the AdminLockService tests: null vs non-null activeAdminIds, the stale/
 *        missing-caller path, and commit/rollback against a fake pool and client, mirroring
 *        the pattern in src/auth/password-reset.service.spec.ts.
 * Author review: Read in full; `npm test` passes (6/6). The behavior these tests pin was
 *                exercised for real via Postman on 2026-09-28 — see /ai/usage-log.md.
 */
import { Pool, PoolClient } from 'pg';
import { Role } from '../auth/caller';
import { ErrorCode } from '../common/error-codes';
import { AdminLockService } from './admin-lock.service';
import { UserRecord, UserStatus, UsersRepository } from './users.repository';

const CALLER_ID = '11111111-1111-4111-8111-111111111111';

function adminCaller(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: CALLER_ID,
    displayName: 'Alex Tan',
    role: Role.ADMIN,
    status: UserStatus.ACTIVE,
    ...overrides,
  } as UserRecord;
}

function build(caller: UserRecord | null = adminCaller(), activeAdminIds: string[] = [CALLER_ID]) {
  const users = {
    findByIdForUpdate: jest.fn<Promise<UserRecord | null>, [string, PoolClient]>(async () => caller),
    selectActiveAdminIdsForUpdate: jest.fn<Promise<string[]>, [PoolClient]>(async () => activeAdminIds),
  };

  // Mirrors password-reset.service.spec.ts: `withTransaction` checks out one client and wraps
  // the work in BEGIN/COMMIT (or ROLLBACK); recording the statements is how these tests see it.
  const statements: string[] = [];
  const client = {
    query: jest.fn<Promise<unknown>, [string]>(async (sql: string) => {
      statements.push(sql);
      return { rows: [] };
    }),
    release: jest.fn(),
  };
  const pool = { connect: jest.fn(async () => client) };

  const service = new AdminLockService(users as unknown as UsersRepository, pool as unknown as Pool);

  return { service, users, statements, client };
}

describe('AdminLockService.run', () => {
  it('locks the full active-admin set when the caller currently qualifies', async () => {
    const { service, users } = build(adminCaller(), [CALLER_ID, 'other-admin-id']);

    const seen = await service.run(CALLER_ID, async (ctx) => ctx.activeAdminIds);

    expect(users.selectActiveAdminIdsForUpdate).toHaveBeenCalled();
    expect(seen).toEqual([CALLER_ID, 'other-admin-id']);
  });

  it.each([
    ['a USER', adminCaller({ role: Role.USER })],
    ['a DEACTIVATED admin', adminCaller({ status: UserStatus.DEACTIVATED })],
  ])('returns null activeAdminIds, without locking the admin set, for %s caller', async (_label, caller) => {
    const { service, users } = build(caller);

    const seen = await service.run(CALLER_ID, async (ctx) => ctx.activeAdminIds);

    expect(seen).toBeNull();
    expect(users.selectActiveAdminIdsForUpdate).not.toHaveBeenCalled();
  });

  it('throws TOKEN_INVALID and never calls fn when the caller no longer exists', async () => {
    const { service } = build(null);
    const fn = jest.fn();

    await expect(service.run(CALLER_ID, fn)).rejects.toMatchObject({
      status: 401,
      code: ErrorCode.TOKEN_INVALID,
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it('commits once fn resolves', async () => {
    const { service, statements } = build();

    await service.run(CALLER_ID, async () => 'ok');

    expect(statements).toEqual(['BEGIN', 'COMMIT']);
  });

  it('rolls back and propagates the error when fn throws', async () => {
    const { service, statements } = build();

    await expect(
      service.run(CALLER_ID, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(statements).toEqual(['BEGIN', 'ROLLBACK']);
  });
});
