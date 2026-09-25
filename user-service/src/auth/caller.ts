/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated the authenticated-caller types and the access-token claim shape.
 * Author review: Read in full; `npm test` passes (67 tests).
 */
import type { Request } from 'express';

export const Role = { USER: 'USER', ADMIN: 'ADMIN' } as const;
export type Role = (typeof Role)[keyof typeof Role];

/** Who the request is from, taken only from a verified token — never from the body. */
export interface Caller {
  id: string;
  role: Role;
}

/** A request that has passed JwtAuthGuard. */
export type AuthedRequest = Request & { caller?: Caller };

/**
 * The access-token payload. Shared with the API Gateway and every other service, so
 * changing it is a cross-service contract change (AGENTS.md, "Integration").
 */
export interface AccessTokenClaims {
  sub: string;
  role: Role;
  iat: number;
  exp: number;
}
