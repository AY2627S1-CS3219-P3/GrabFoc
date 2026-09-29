/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Sonnet 5), date: 2026-09-27
 * Scope: Generated the shared last-admin lock helper for PATCH /admin/users/:userId/role
 *        (Step 10, endpoint 2) and reused later by Step 12's self-deactivate — see
 *        user-service/AGENTS.md, "The last-admin lock".
 * Author review: Verified via Postman on 2026-09-28, through PATCH /admin/users/:userId/role
 *                (promote, self-reaffirm no-op, self-demote with/without another admin, a
 *                distinct-target demotion) — see /ai/usage-log.md.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { Role } from '../auth/caller';
import { AppError } from '../common/app-error';
import { ErrorCode } from '../common/error-codes';
import { PG_POOL, withTransaction } from '../db/database';
import { UserRecord, UserStatus, UsersRepository } from './users.repository';

/**
 * What a caller inside the lock gets to work with. `activeAdminIds` is `null` when `caller`
 * does not currently qualify as an active admin — a stale token, or a caller who was never
 * one — which is the signal that no admin-only branch beyond that should be trusted.
 */
export interface AdminLockContext {
  client: PoolClient;
  caller: UserRecord;
  activeAdminIds: string[] | null;
}

/**
 * Enforces "no change may leave zero ACTIVE admins" (AGENTS.md, "The last-admin lock"),
 * shared by the role-change endpoint and Step 12's self-deactivate so the invariant is
 * implemented exactly once rather than twice, slightly differently.
 *
 * Locks the caller's own row first, and only widens the lock to every active admin's row
 * when the caller currently qualifies as one — a non-admin's request never contends for that
 * lock. The caller's role and status are re-read fresh here rather than trusted from the
 * access token, which closes the window where a demoted admin's still-valid (up to 15
 * minutes old) token could otherwise be used to change a role.
 */
@Injectable()
export class AdminLockService {
  constructor(
    private readonly users: UsersRepository,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async run<T>(callerId: string, fn: (ctx: AdminLockContext) => Promise<T>): Promise<T> {
    return withTransaction(this.pool, async (client) => {
      const caller = await this.users.findByIdForUpdate(callerId, client);
      if (!caller) {
        // The caller's own account is gone since the token was issued — no request should
        // ever be satisfied on behalf of an id that no longer exists.
        throw new AppError(401, ErrorCode.TOKEN_INVALID, 'Your session is no longer valid.');
      }
      const activeAdminIds =
        caller.role === Role.ADMIN && caller.status === UserStatus.ACTIVE
          ? await this.users.selectActiveAdminIdsForUpdate(client)
          : null;
      return fn({ client, caller, activeAdminIds });
    });
  }
}
