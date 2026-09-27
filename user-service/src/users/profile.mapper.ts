/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Sonnet 5), date: 2026-09-27
 * Scope: Generated the user-record-to-profile-response mapping shared by the admin and
 *        self-profile endpoints, from the "Profile" response shape in user-service/AGENTS.md.
 * Author review: Verified via Postman against the compose stack on 2026-09-27 — response items
 *                for GET /admin/users matched the documented Profile shape — see
 *                /ai/usage-log.md.
 */
import { Role } from '../auth/caller';
import { decrypt } from '../crypto';
import { UserRecord, UserStatus } from './users.repository';

/**
 * The "Profile" shape from AGENTS.md: `{ userId, displayName, email, countryCode,
 * mobileNumber, role, status, createdAt }`. Used by every endpoint that returns a user,
 * admin or self.
 */
export interface ProfileResponse {
  userId: string;
  displayName: string;
  email: string;
  countryCode: string | null;
  mobileNumber: string | null;
  role: Role;
  status: UserStatus;
  createdAt: string;
}

/**
 * Decrypts `emailEncrypted`/`mobileEncrypted` for display. `mobileEncrypted` holds only the
 * digits (the country code is its own plaintext column — see `registration.service.ts`), so
 * both are null only for the bootstrap admin, which the schema permits.
 */
export function toProfileResponse(user: UserRecord): ProfileResponse {
  return {
    userId: user.id,
    displayName: user.displayName,
    email: decrypt(user.emailEncrypted),
    countryCode: user.countryCode,
    mobileNumber: user.mobileEncrypted ? decrypt(user.mobileEncrypted) : null,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  };
}
