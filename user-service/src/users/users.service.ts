/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Sonnet 5), date: 2026-09-28
 * Scope: Generated the self-profile service for GET /users/me and PATCH /users/me (Step 11).
 * Author review: Verified via Postman against the compose stack on 2026-09-28 — GET returns
 *                the self profile shape (no role/status/createdAt), PATCH renames and reflects
 *                the new name on a follow-up GET, an unknown body field is rejected with 400,
 *                and no token gets 401 — see /ai/usage-log.md.
 */
import { Injectable } from '@nestjs/common';
import { SelfProfileResponse, toSelfProfileResponse } from './profile.mapper';
import { UsersRepository } from './users.repository';

/**
 * `GET /users/me` and `PATCH /users/me` (Step 11). Distinct from `AdminService`: this is the
 * self-service track, not the admin track, and it only ever acts on the caller's own row —
 * the id always comes from the verified token (`UsersController`), never a path parameter.
 */
@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  /**
   * No not-found handling: a verified token's subject always has a row (accounts are
   * deactivated, never deleted), the same assumption `AdminService.changeRole` makes after its
   * own writes.
   */
  async getSelf(userId: string): Promise<SelfProfileResponse> {
    const user = await this.users.findById(userId);
    return toSelfProfileResponse(user!);
  }

  async updateDisplayName(userId: string, displayName: string): Promise<SelfProfileResponse> {
    await this.users.updateDisplayName(userId, displayName);
    const user = await this.users.findById(userId);
    return toSelfProfileResponse(user!);
  }
}
