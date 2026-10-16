/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Adapted from supplier-service/src/common/auth.ts: the same guard, the same @Roles
 *        decorator and the same access_denied logging, with the dev-auth header fallback removed
 *        (see the note in src/config.ts) and no config import left to need it.
 * Author review: pending — Cole Lin to record what he checked.
 */
import { CanActivate, ExecutionContext, Injectable, Logger, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { JwksUnavailableError, verifyToken } from './jwks';
import { ProblemException } from './problem';
import { logPath, requestIdOf } from './request-id';

export type Role = 'ADMIN' | 'USER';
export interface Caller {
  id: string;
  role: Role;
}
export type AuthedRequest = Request & { caller: Caller };

const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

const logger = new Logger('Access');

/** Log a denied attempt in one structured format (401 and 403) and return the exception to throw. */
export function denied(req: Request, status: 401 | 403, detail: string, caller?: Caller): ProblemException {
  logger.warn(
    JSON.stringify({
      event: 'access_denied',
      requestId: requestIdOf(req),
      status,
      method: req.method,
      path: logPath(req),
      userId: caller?.id ?? null,
      role: caller?.role ?? null,
    }),
  );
  return new ProblemException(status, detail);
}

/**
 * Every request must carry a bearer token issued by the User Service. There is no header fallback
 * here: this store holds one row per request for every service, so nothing unauthenticated may
 * reach it.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const authorization = req.header('authorization');

    let claims;
    try {
      claims = await verifyToken(authorization);
    } catch (err) {
      if (err instanceof JwksUnavailableError) {
        // The message names the JWKS URL and the underlying failure, so it goes in Nest's trace
        // argument rather than the structured line, as on the 500 path in problem.ts.
        logger.error(
          JSON.stringify({
            event: 'jwks_unavailable',
            requestId: requestIdOf(req),
            method: req.method,
            path: logPath(req),
          }),
          err.message,
        );
        throw new ProblemException(503, 'Cannot verify credentials right now. Try again shortly.');
      }
      throw err;
    }

    if (!claims || (claims.role !== 'ADMIN' && claims.role !== 'USER')) {
      throw denied(req, 401, 'Missing or invalid credentials.');
    }
    req.caller = { id: claims.sub, role: claims.role };
    return this.checkRole(context, req);
  }

  private checkRole(context: ExecutionContext, req: AuthedRequest): boolean {
    const allowed = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed && !allowed.includes(req.caller.role)) {
      throw denied(req, 403, 'This action requires the ADMIN role.', req.caller);
    }
    return true;
  }
}
