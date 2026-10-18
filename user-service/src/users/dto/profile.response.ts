/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from the response types in user-service/src/users/profile.mapper.ts (original disclosure: Claude Code, Claude Sonnet 5, 2026-09-27). The mapping itself moved into UsersService.
 * Author review: Successfully reviewed by Deanson, 2026-10-16.
 */
// AI-generated (reviewed by Deanson)
import { Role } from '../../common/enums/role.enum';
import { UserStatus } from '../../common/enums/user-status.enum';

/** GET/PATCH /users/me and the email/mobile changes. The caller is not shown their own role or status. */
export interface SelfProfile {
  userId: string;
  displayName: string;
  email: string;
  /** Null only for the bootstrap admin. */
  countryCode: string | null;
  mobileNumber: string | null;
}

/** /admin/users responses: the self shape plus role, status and createdAt. */
export interface AdminProfile extends SelfProfile {
  role: Role;
  status: UserStatus;
  createdAt: string;
}
