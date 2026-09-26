/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-27
 * Scope: Generated the first-admin bootstrap tests against a fake users repository, including
 *        the ones that pin the idempotence and the "no address in the log" rule.
 * Author review: Read in full; every assertion was confirmed to fail against a deliberately
 *                broken version of the service.
 */
import { Logger } from '@nestjs/common';
import { AuditEvent } from '../common/logger';
import { decrypt, hashEmail } from '../crypto';
import {
  AdminBootstrapService,
  BOOTSTRAP_ADMIN_DISPLAY_NAME,
} from './admin-bootstrap.service';
import { NewBootstrapAdmin, UserRecord, UserStatus, UsersRepository } from './users.repository';
import { Role } from '../auth/caller';

const EMAIL = 'admin@u.nus.edu';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';

function adminRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: ADMIN_ID,
    displayName: BOOTSTRAP_ADMIN_DISPLAY_NAME,
    role: Role.ADMIN,
    status: UserStatus.ACTIVE,
    passwordHash: null,
    ...overrides,
  } as UserRecord;
}

/**
 * `created` is what the guarded insert returns: a row when the table was empty, null when it
 * was not. `hasAdmin` is the separate diagnostic query.
 */
function build({
  created = adminRecord(),
  hasAdmin = true,
}: { created?: UserRecord | null; hasAdmin?: boolean } = {}) {
  const inserted: NewBootstrapAdmin[] = [];

  const users = {
    insertBootstrapAdminIfFirst: jest.fn(async (admin: NewBootstrapAdmin) => {
      inserted.push(admin);
      return created;
    }),
    hasActiveAdmin: jest.fn(async () => hasAdmin),
  };

  const service = new AdminBootstrapService(users as unknown as UsersRepository);

  // The logger is where two of the rules live — the audit event and the absence of the address
  // — so it is captured rather than silenced.
  const logs: string[] = [];
  const warns: string[] = [];
  jest.spyOn(Logger.prototype, 'log').mockImplementation((m: unknown) => logs.push(String(m)));
  jest.spyOn(Logger.prototype, 'warn').mockImplementation((m: unknown) => warns.push(String(m)));

  return { service, users, inserted, logs, warns };
}

afterEach(() => jest.restoreAllMocks());

describe('AdminBootstrapService', () => {
  describe('creating the first admin', () => {
    it('inserts an ADMIN with no password when the table is empty', async () => {
      const { service, users, inserted } = build();

      const created = await service.run(EMAIL);

      expect(created?.role).toBe(Role.ADMIN);
      expect(created?.status).toBe(UserStatus.ACTIVE);
      // The account cannot be logged into until the owner claims it through forgot-password.
      expect(created?.passwordHash).toBeNull();
      expect(users.insertBootstrapAdminIfFirst).toHaveBeenCalledTimes(1);
      expect(inserted[0].displayName).toBe(BOOTSTRAP_ADMIN_DISPLAY_NAME);
    });

    it('stores the address encrypted and under the same hash forgot-password will look up', async () => {
      const { service, inserted } = build();

      await service.run(EMAIL);

      // Without this the admin row exists but `POST /auth/password/forgot` cannot find it, and
      // the account is unclaimable.
      expect(inserted[0].emailHash).toBe(hashEmail(EMAIL));
      expect(decrypt(inserted[0].emailEncrypted)).toBe(EMAIL);
    });

    it('normalises the address before hashing it', async () => {
      const { service, inserted } = build();

      await service.run('  ADMIN@U.NUS.EDU  ');

      // `Admin@U.NUS.edu` in the environment must reach the same row as `admin@u.nus.edu`.
      expect(inserted[0].emailHash).toBe(hashEmail(EMAIL));
      expect(decrypt(inserted[0].emailEncrypted)).toBe(EMAIL);
    });

    it('logs ADMIN_BOOTSTRAPPED with the user id', async () => {
      const { service, logs } = build();

      await service.run(EMAIL);

      const audit = logs.find((line) => line.includes(AuditEvent.ADMIN_BOOTSTRAPPED));
      expect(audit).toBeDefined();
      expect(JSON.parse(audit as string)).toMatchObject({
        event: AuditEvent.ADMIN_BOOTSTRAPPED,
        userId: ADMIN_ID,
      });
    });

    it('never writes the address to the log', async () => {
      const { service, logs, warns } = build();

      await service.run(EMAIL);

      // NFR5.1. Asserted on the whole output rather than one line, because a plaintext address
      // is just as leaked from the friendly message as from the audit event.
      for (const line of [...logs, ...warns]) {
        expect(line).not.toContain(EMAIL);
        expect(line).not.toContain('u.nus.edu');
      }
    });

    it('does not run the no-admin diagnostic when it has just created one', async () => {
      const { service, users } = build();

      await service.run(EMAIL);

      expect(users.hasActiveAdmin).not.toHaveBeenCalled();
    });
  });

  describe('doing nothing', () => {
    it('inserts nothing when the variable is unset', async () => {
      const { service, users } = build();

      await expect(service.run(undefined)).resolves.toBeNull();

      expect(users.insertBootstrapAdminIfFirst).not.toHaveBeenCalled();
    });

    it('inserts nothing when the variable is an empty string', async () => {
      // `config.ts` maps an empty variable to undefined, but this must not depend on that:
      // `.env.example` ships `USER_BOOTSTRAP_ADMIN_EMAIL=` with no value.
      const { service, users } = build();

      await expect(service.run('')).resolves.toBeNull();

      expect(users.insertBootstrapAdminIfFirst).not.toHaveBeenCalled();
    });

    it('returns null when the table already has rows', async () => {
      const { service } = build({ created: null });

      // The normal path on every start after the first. The insert is still attempted — the
      // `WHERE NOT EXISTS` guard is in the statement, not here — and reports that it wrote
      // nothing.
      await expect(service.run(EMAIL)).resolves.toBeNull();
    });

    it('is safe to run twice: the second run creates nothing', async () => {
      const { service, users } = build({ created: null });

      await service.run(EMAIL);
      await service.run(EMAIL);

      expect(users.insertBootstrapAdminIfFirst).toHaveBeenCalledTimes(2);
      // Idempotence comes from the statement, so calling again is harmless. Every start after
      // the first takes this path.
      expect(users.hasActiveAdmin).toHaveBeenCalled();
    });
  });

  describe('rejecting a misconfigured address', () => {
    // A startup failure, not a silent skip: each of these would create an admin account that
    // `POST /auth/password/forgot` refuses to accept, so nobody could ever claim it.
    it.each([
      ['not an email at all', 'admin'],
      ['a non-NUS domain', 'admin@gmail.com'],
      // `u.nus.edu` is allowed but `evil.u.nus.edu` is a domain we do not control.
      ['a subdomain of an allowed domain', 'admin@evil.u.nus.edu'],
    ])('throws for %s', async (_label, value) => {
      const { service, users } = build();

      await expect(service.run(value)).rejects.toThrow(/USER_BOOTSTRAP_ADMIN_EMAIL/);

      expect(users.insertBootstrapAdminIfFirst).not.toHaveBeenCalled();
    });
  });

  describe('the no-admin warning', () => {
    it('warns when rows exist but no ACTIVE admin does', async () => {
      const { service, warns } = build({ created: null, hasAdmin: false });

      await service.run(EMAIL);

      // The state AGENTS.md describes as needing a manual database change. Nothing here can
      // repair it; the point is that it is not discovered later through a 403.
      expect(warns.join('\n')).toMatch(/No ACTIVE admin/);
    });

    it('stays quiet when an admin already exists', async () => {
      const { service, warns } = build({ created: null, hasAdmin: true });

      await service.run(EMAIL);

      expect(warns).toEqual([]);
    });
  });

  describe('the startup hook', () => {
    it('runs on onApplicationBootstrap', async () => {
      // Registered as a lifecycle hook, so nothing calls it explicitly. `onApplicationBootstrap`
      // rather than `onModuleInit`, because the migrations that create `users` run in the
      // latter.
      const { service, users } = build({ created: null });
      const run = jest.spyOn(service, 'run');

      await service.onApplicationBootstrap();

      expect(run).toHaveBeenCalledTimes(1);
      expect(users.hasActiveAdmin).toHaveBeenCalled();
    });
  });
});
