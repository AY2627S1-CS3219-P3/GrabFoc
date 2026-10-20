/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from user-service/src/auth/caller.ts (original disclosure: Claude Code, Claude Opus 5, 2026-09-25); the caller now lives on req.user.
 * Author review: Successfully reviewed by Deanson, 2026-10-16.
 */
// AI-generated (reviewed by Deanson)
import type { Request } from 'express';
import { Role } from '../enums/role.enum';

/** Who the request is from, taken only from a verified token, never from the body. */
export interface AuthUser {
  id: string;
  role: Role;
}

/** A request that has passed AuthGuard. */
export type AuthedRequest = Request & { user?: AuthUser };
