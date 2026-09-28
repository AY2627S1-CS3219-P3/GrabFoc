/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Sonnet 5), date: 2026-09-27
 * Scope: Generated the first spec file for AdminService: backfilled coverage for `listUsers`
 *        (previously verified only manually via Postman) and every branch of the new
 *        `changeRole` (Step 10, endpoint 2), mocking `AdminLockService` and `UsersRepository`
 *        as collaborators, mirroring src/auth/password-reset.service.spec.ts's style.
 *        2026-09-27: two tests originally asserted an impossible mock state (`activeAdminIds`
 *        excluding the caller, which `AdminLockService` can never actually produce) and were
 *        replaced after that mistake led to finding LAST_ADMIN was unreachable in the real
 *        code — see admin.service.ts's disclosure header.
 * Author review: Read in full; `npm test` passes (11/11), and every `changeRole` branch this
 *                file asserts was exercised for real via Postman on 2026-09-28, including the
 *                LAST_ADMIN case the two rewritten tests now correctly cover — see
 *                /ai/usage-log.md.
 *                2026-09-28: added coverage for the new `reactivate` (Step 13): happy path,
 *                404 for an unknown target, and 409 NOT_DEACTIVATED for a non-DEACTIVATED one.
 * Author review: Read in full; `npm test` passes, and every branch was also exercised for real
 *                via Postman against the compose stack on 2026-09-28 — see /ai/usage-log.md.
 */
import { Role } from '../auth/caller';
import { ErrorCode } from '../common/error-codes';
import { encrypt } from '../crypto';
import { AdminLockContext, AdminLockService } from './admin-lock.service';
import { AdminService } from './admin.service';
import { UserRecord, UserStatus, UsersRepository } from './users.repository';

const CALLER_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ADMIN_ID = '33333333-3333-4333-8333-333333333333';

function userRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: TARGET_ID,
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

const CALLER = userRecord({ id: CALLER_ID, role: Role.ADMIN, displayName: 'Admin Caller' });

/**
 * `lockActiveAdminIds: undefined` reproduces `AdminLockService`'s own null case (a stale or
 * non-admin caller) without re-testing its internals, which `admin-lock.service.spec.ts`
 * already covers in isolation.
 */
function build(lockActiveAdminIds: string[] | null = [CALLER_ID]) {
  const users = {
    listUsers: jest.fn<Promise<UserRecord[]>, [{ role?: Role; status?: UserStatus }]>(async () => [CALLER]),
    findById: jest.fn<Promise<UserRecord | null>, [string]>(async () => userRecord()),
    updateRole: jest.fn<Promise<boolean>, [string, Role]>(async () => true),
    reactivate: jest.fn<Promise<boolean>, [string]>(async () => true),
  };

  const lock = {
    run: jest.fn(async (_callerId: string, fn: (ctx: AdminLockContext) => Promise<unknown>) =>
      fn({
        client: {} as AdminLockContext['client'],
        caller: CALLER,
        activeAdminIds: lockActiveAdminIds,
      }),
    ),
  };

  const service = new AdminService(users as unknown as UsersRepository, lock as unknown as AdminLockService);

  return { service, users, lock };
}

describe('listUsers', () => {
  it('passes the role/status filter through and maps every row to a profile', async () => {
    const { service, users } = build();

    const result = await service.listUsers({ role: Role.ADMIN, status: UserStatus.ACTIVE });

    expect(users.listUsers).toHaveBeenCalledWith({ role: Role.ADMIN, status: UserStatus.ACTIVE });
    expect(result).toEqual({ items: [expect.objectContaining({ userId: CALLER_ID, email: 'alex@u.nus.edu' })] });
  });
});

describe('changeRole', () => {
  it('rejects with 403 when the caller is not currently an active admin', async () => {
    const { service, users } = build(null);

    await expect(service.changeRole(CALLER_ID, TARGET_ID, Role.ADMIN)).rejects.toMatchObject({
      status: 403,
      code: ErrorCode.FORBIDDEN,
    });
    expect(users.findById).not.toHaveBeenCalled();
    expect(users.updateRole).not.toHaveBeenCalled();
  });

  it('rejects self-demotion with CANNOT_MODIFY_SELF when another admin exists', async () => {
    const { service, users } = build([CALLER_ID, OTHER_ADMIN_ID]);

    await expect(service.changeRole(CALLER_ID, CALLER_ID, Role.USER)).rejects.toMatchObject({
      status: 409,
      code: ErrorCode.CANNOT_MODIFY_SELF,
    });
    expect(users.updateRole).not.toHaveBeenCalled();
  });

  it('rejects self-demotion with LAST_ADMIN when the caller is the sole active admin', async () => {
    // `activeAdminIds` always includes the caller when non-null, so length 1 here means the
    // caller IS the only admin — there is no "other admin" for CANNOT_MODIFY_SELF to defer to.
    const { service, users } = build([CALLER_ID]);

    await expect(service.changeRole(CALLER_ID, CALLER_ID, Role.USER)).rejects.toMatchObject({
      status: 409,
      code: ErrorCode.LAST_ADMIN,
    });
    expect(users.updateRole).not.toHaveBeenCalled();
  });

  it('treats re-affirming your own ADMIN role as a no-op: no write, no lookup of a target', async () => {
    const { service, users } = build();

    const result = await service.changeRole(CALLER_ID, CALLER_ID, Role.ADMIN);

    expect(result).toEqual(expect.objectContaining({ userId: CALLER_ID }));
    expect(users.findById).not.toHaveBeenCalled();
    expect(users.updateRole).not.toHaveBeenCalled();
  });

  it('rejects with 404 when the target does not exist', async () => {
    const { service, users } = build();
    users.findById.mockResolvedValueOnce(null);

    await expect(service.changeRole(CALLER_ID, TARGET_ID, Role.ADMIN)).rejects.toMatchObject({
      status: 404,
      code: ErrorCode.NOT_FOUND,
    });
    expect(users.updateRole).not.toHaveBeenCalled();
  });

  it.each([UserStatus.DEACTIVATED, UserStatus.SUSPENDED])(
    'rejects with USER_NOT_ACTIVE when the target is %s',
    async (status) => {
      const { service, users } = build();
      users.findById.mockResolvedValueOnce(userRecord({ status }));

      await expect(service.changeRole(CALLER_ID, TARGET_ID, Role.ADMIN)).rejects.toMatchObject({
        status: 409,
        code: ErrorCode.USER_NOT_ACTIVE,
      });
      expect(users.updateRole).not.toHaveBeenCalled();
    },
  );

  it('allows demoting a distinct admin with no last-admin check (the caller remains an admin)', async () => {
    // `activeAdminIds` realistically includes the caller alongside the target — the caller is
    // always a member whenever the list is non-null, so this can never zero the admin count.
    const { service, users } = build([CALLER_ID, TARGET_ID]);
    users.findById.mockResolvedValueOnce(userRecord({ role: Role.ADMIN, status: UserStatus.ACTIVE }));

    await service.changeRole(CALLER_ID, TARGET_ID, Role.USER);

    expect(users.updateRole).toHaveBeenCalledWith(TARGET_ID, Role.USER, expect.anything());
  });

  it('allows promoting a USER with no last-admin check', async () => {
    const { service, users } = build([CALLER_ID]);
    users.findById.mockResolvedValueOnce(userRecord({ role: Role.USER, status: UserStatus.ACTIVE }));

    const result = await service.changeRole(CALLER_ID, TARGET_ID, Role.ADMIN);

    expect(users.updateRole).toHaveBeenCalledWith(TARGET_ID, Role.ADMIN, expect.anything());
    expect(result).toEqual(expect.objectContaining({ userId: TARGET_ID }));
  });

  it('logs ADMIN_ACTION only after lock.run (the transaction) has resolved', async () => {
    const { service, users, lock } = build([CALLER_ID]);
    users.findById.mockResolvedValueOnce(userRecord({ role: Role.USER, status: UserStatus.ACTIVE }));
    const logSpy = jest.spyOn((service as unknown as { logger: { log: (m: unknown) => void } }).logger, 'log');

    await service.changeRole(CALLER_ID, TARGET_ID, Role.ADMIN);

    const lockOrder = lock.run.mock.invocationCallOrder[0];
    const logOrder = logSpy.mock.invocationCallOrder[0];
    expect(logOrder).toBeGreaterThan(lockOrder);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"event":"ADMIN_ACTION"'));
  });
});

describe('reactivate', () => {
  it('reactivates a DEACTIVATED target and logs ADMIN_ACTION', async () => {
    const { service, users } = build();
    users.findById
      .mockResolvedValueOnce(userRecord({ status: UserStatus.DEACTIVATED }))
      .mockResolvedValueOnce(userRecord({ status: UserStatus.ACTIVE }));
    const logSpy = jest.spyOn((service as unknown as { logger: { log: (m: unknown) => void } }).logger, 'log');

    const result = await service.reactivate(CALLER_ID, TARGET_ID);

    expect(users.reactivate).toHaveBeenCalledWith(TARGET_ID);
    expect(result).toEqual(expect.objectContaining({ userId: TARGET_ID, status: UserStatus.ACTIVE }));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"event":"ADMIN_ACTION"'));
  });

  it('rejects with 404 when the target does not exist', async () => {
    const { service, users } = build();
    users.findById.mockResolvedValueOnce(null);

    await expect(service.reactivate(CALLER_ID, TARGET_ID)).rejects.toMatchObject({
      status: 404,
      code: ErrorCode.NOT_FOUND,
    });
    expect(users.reactivate).not.toHaveBeenCalled();
  });

  it.each([UserStatus.ACTIVE, UserStatus.SUSPENDED])(
    'rejects with 409 NOT_DEACTIVATED when the target is %s',
    async (status) => {
      const { service, users } = build();
      users.findById.mockResolvedValueOnce(userRecord({ status }));

      await expect(service.reactivate(CALLER_ID, TARGET_ID)).rejects.toMatchObject({
        status: 409,
        code: ErrorCode.NOT_DEACTIVATED,
      });
      expect(users.reactivate).not.toHaveBeenCalled();
    },
  );
});
