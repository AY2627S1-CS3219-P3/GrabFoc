/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Sonnet 5), date: 2026-09-27
 * Scope: Generated the admin-service list method for GET /admin/users (Step 10, endpoint 1
 *        only — the role-change endpoint is deliberately not implemented yet, at the user's
 *        request, pending their manual verification of this endpoint first).
 * Author review: Verified via Postman against the compose stack on 2026-09-27 (happy path,
 *                role/status filters, 400 on unknown/invalid query params, 403 for a non-admin,
 *                401 for no/invalid token) — see /ai/usage-log.md.
 */
import { Injectable } from '@nestjs/common';
import { AdminListUsersQuery } from './users.schemas';
import { ProfileResponse, toProfileResponse } from './profile.mapper';
import { AdminUserFilter, UsersRepository } from './users.repository';

@Injectable()
export class AdminService {
  constructor(private readonly users: UsersRepository) {}

  /**
   * `GET /admin/users`. Plain read, no locking — only `PATCH .../role` and self-deactivate
   * touch the last-admin invariant, so this method has nothing to protect.
   */
  async listUsers(query: AdminListUsersQuery): Promise<{ items: ProfileResponse[] }> {
    const filter: AdminUserFilter = { role: query.role, status: query.status };
    const users = await this.users.listUsers(filter);
    return { items: users.map(toProfileResponse) };
  }
}
