/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: JWT guard for the balance route, following supplier-service/src/common/auth.ts without
 *        its dev-auth header fallback or role decorator.
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Log the path without its query string (PR #48/#73 review).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { JwksUnavailableError, verifyToken } from './jwks';
import { ProblemException } from './problem';

export type Role = 'ADMIN' | 'USER';
export interface Caller {
  id: string;
  role: Role;
}
export type AuthedRequest = Request & { caller: Caller };

const logger = new Logger('Access');

/** Log a denied attempt in one structured format (401 and 403) and return the exception to throw. */
export function denied(req: Request, status: 401 | 403, detail: string, caller?: Caller): ProblemException {
  logger.warn(
    JSON.stringify({
      event: 'access_denied',
      status,
      method: req.method,
      // The path only: a query string could carry a secret (PR #48/#73 review).
      path: req.originalUrl.split('?')[0],
      userId: caller?.id ?? null,
      role: caller?.role ?? null,
    }),
  );
  return new ProblemException(status, detail);
}

/**
 * Requires a user token issued by the User Service. The gateway checks it too, but this service
 * re-verifies rather than trusting whatever reached it over the network (root AGENTS.md §6).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    let claims;
    try {
      claims = await verifyToken(req.header('authorization'));
    } catch (err) {
      if (err instanceof JwksUnavailableError) {
        logger.error(`Cannot verify tokens: ${err.message}`);
        throw new ProblemException(503, 'Cannot verify credentials right now. Try again shortly.');
      }
      throw err;
    }
    if (!claims || (claims.role !== 'ADMIN' && claims.role !== 'USER')) {
      throw denied(req, 401, 'Missing or invalid credentials.');
    }
    req.caller = { id: claims.sub, role: claims.role };
    return true;
  }
}
