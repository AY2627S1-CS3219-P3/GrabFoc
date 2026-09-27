/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Sonnet 5), date: 2026-09-27
 * Scope: Generated the admin-service list method for GET /admin/users (Step 10, endpoint 1),
 *        and 2026-09-27: added `changeRole` for PATCH /admin/users/:userId/role (Step 10,
 *        endpoint 2), using the new `AdminLockService`. Also 2026-09-27: fixed a bug where
 *        LAST_ADMIN could never fire (the check compared activeAdminIds against a target that,
 *        by construction, could never be the sole entry) by moving the sole-admin check into
 *        the self-demotion branch, where it is actually reachable.
 * Author review: `listUsers` verified via Postman against the compose stack on 2026-09-27
 *                (happy path, role/status filters, 400 on unknown/invalid query params, 403
 *                for a non-admin, 401 for no/invalid token). `changeRole` verified via Postman
 *                on 2026-09-28, after the LAST_ADMIN fix above (promote, self-reaffirm no-op,
 *                self-demote with/without another admin present, distinct-target demotion,
 *                404/400/403/401) — see /ai/usage-log.md.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Role } from '../auth/caller';
import { AppError } from '../common/app-error';
import { ErrorCode } from '../common/error-codes';
import { AuditEvent, auditLine } from '../common/logger';
import { AdminLockService } from './admin-lock.service';
import { ProfileResponse, toProfileResponse } from './profile.mapper';
import { AdminUserFilter, UserStatus, UsersRepository } from './users.repository';
import { AdminListUsersQuery } from './users.schemas';

@Injectable()
export class AdminService {
  private readonly logger = new Logger('Admin');

  constructor(
    private readonly users: UsersRepository,
    private readonly lock: AdminLockService,
  ) {}

  /**
   * `GET /admin/users`. Plain read, no locking — only `PATCH .../role` and self-deactivate
   * touch the last-admin invariant, so this method has nothing to protect.
   */
  async listUsers(query: AdminListUsersQuery): Promise<{ items: ProfileResponse[] }> {
    const filter: AdminUserFilter = { role: query.role, status: query.status };
    const users = await this.users.listUsers(filter);
    return { items: users.map(toProfileResponse) };
  }

  /**
   * `PATCH /admin/users/:userId/role` (AGENTS.md, "Promotion" and "The last-admin lock").
   *
   * Branch order matters: the stale-caller check must run before anything else, because the
   * branches after it (self-demotion, last-admin) all presuppose the caller is a real, current
   * admin — reporting one of those instead of 403 would tell a demoted caller "you're an admin,
   * but—" when the true answer is that they no longer are.
   *
   * `LAST_ADMIN` only ever applies to *self*-demotion. `activeAdminIds` is non-null only when
   * the caller is currently an active admin, which means the caller's own id is necessarily a
   * member of it — so a demotion targeting anyone else can never be the one that drops the
   * count to zero (the caller remains an admin throughout). The sole case that can is the sole
   * admin demoting themselves, which is why the check lives inside the self-demotion branch
   * rather than the distinct-target one.
   */
  async changeRole(callerId: string, targetId: string, role: Role): Promise<ProfileResponse> {
    const result = await this.lock.run(callerId, async (ctx) => {
      if (ctx.activeAdminIds === null) {
        throw new AppError(403, ErrorCode.FORBIDDEN, 'You are not an active admin.');
      }

      if (targetId === callerId) {
        if (role === Role.USER) {
          // `activeAdminIds` always includes the caller's own id here (that's what makes it
          // non-null), so a length of 1 means the caller IS the sole active admin — the one
          // case AGENTS.md's "another admin must do it" reasoning for CANNOT_MODIFY_SELF
          // doesn't cover, because there is no other admin to hand it to.
          if (ctx.activeAdminIds.length === 1) {
            throw new AppError(
              409,
              ErrorCode.LAST_ADMIN,
              'Promote another admin first — you are the only one.',
            );
          }
          throw new AppError(
            409,
            ErrorCode.CANNOT_MODIFY_SELF,
            'Ask another admin to change your own role.',
          );
        }
        // role === ADMIN: re-affirming your own role changes nothing, so there is nothing to
        // write or to audit-log — logging a "change" that did not happen would be a false
        // record (AGENTS.md, "Admin actions are logged after the transaction commits").
        return { profile: toProfileResponse(ctx.caller), changed: false as const };
      }

      const target = await this.users.findById(targetId, ctx.client);
      if (!target) {
        throw new AppError(404, ErrorCode.NOT_FOUND, 'No such user.');
      }
      if (target.status !== UserStatus.ACTIVE) {
        throw new AppError(
          409,
          ErrorCode.USER_NOT_ACTIVE,
          'Only an active user can have their role changed.',
        );
      }
      // No last-admin check needed for a distinct target: the caller is always a member of
      // `activeAdminIds` whenever it is non-null, so demoting someone else can never drop the
      // active-admin count below 1 (the caller remains one throughout). The only way to reach
      // zero admins is the caller demoting themselves while they are the sole admin, which is
      // handled above.

      await this.users.updateRole(target.id, role, ctx.client);
      const updated = await this.users.findById(target.id, ctx.client);
      return {
        profile: toProfileResponse(updated!),
        changed: true as const,
        targetId: target.id,
        fromRole: target.role,
        toRole: role,
      };
    });

    // Logged only after `lock.run` returns, i.e. only after the transaction has committed —
    // never inside the callback, where the change could still roll back.
    if (result.changed) {
      this.logger.log(
        auditLine(AuditEvent.ADMIN_ACTION, {
          actorId: callerId,
          targetId: result.targetId,
          action: 'ROLE_CHANGE',
          from: result.fromRole,
          to: result.toRole,
        }),
      );
    }

    return result.profile;
  }
}
