/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from Roles in user-service/src/auth/decorators.ts (original disclosure: Claude Code, Claude Opus 5, 2026-09-25).
 * Author review: Pending Deanson's review.
 */
// AI-generated (review pending: Deanson)
import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';

/** Restricts a route (or a whole controller) to the given roles. Enforced by AuthGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
