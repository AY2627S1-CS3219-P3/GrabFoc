/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Sonnet 5), date: 2026-09-27
 * Scope: Generated the user-record-to-profile-response mapping used by the admin endpoints,
 *        from the "Profile" response shape in user-service/AGENTS.md. 2026-09-28: split out
 *        `toSelfProfileResponse`/`SelfProfileResponse` for Step 11's GET/PATCH /users/me,
 *        which return a narrower shape (no role/status/createdAt) than the admin-facing one;
 *        `toProfileResponse` is now built on top of it rather than duplicating the decrypts.
 * Author review: Verified via Postman against the compose stack on 2026-09-27 — response items
 *                for GET /admin/users matched the documented Profile shape — see
 *                /ai/usage-log.md. The 2026-09-28 split is a behavior-preserving refactor for
 *                the admin shape (same fields, same values); see profile.mapper.spec.ts.
 */
import { Role } from '../auth/caller';
import { decrypt } from '../crypto';
import { UserRecord, UserStatus } from './users.repository';

/**
 * The "Self profile" shape from AGENTS.md: `{ userId, displayName, email, countryCode,
 * mobileNumber }`. Returned by `GET /users/me` and `PATCH /users/me` — a user isn't shown
 * their own `role`, `status` or `createdAt` by these endpoints.
 */
export interface SelfProfileResponse {
  userId: string;
  displayName: string;
  email: string;
  countryCode: string | null;
  mobileNumber: string | null;
}

/**
 * Decrypts `emailEncrypted`/`mobileEncrypted` for display. `mobileEncrypted` holds only the
 * digits (the country code is its own plaintext column — see `registration.service.ts`), so
 * both are null only for the bootstrap admin, which the schema permits.
 */
export function toSelfProfileResponse(user: UserRecord): SelfProfileResponse {
  return {
    userId: user.id,
    displayName: user.displayName,
    email: decrypt(user.emailEncrypted),
    countryCode: user.countryCode,
    mobileNumber: user.mobileEncrypted ? decrypt(user.mobileEncrypted) : null,
  };
}

/**
 * The admin-facing "Profile" shape from AGENTS.md: the self shape plus `role`, `status` and
 * `createdAt`. Used by `GET /admin/users` and `PATCH /admin/users/:userId/role`.
 */
export interface ProfileResponse extends SelfProfileResponse {
  role: Role;
  status: UserStatus;
  createdAt: string;
}

export function toProfileResponse(user: UserRecord): ProfileResponse {
  return {
    ...toSelfProfileResponse(user),
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  };
}
