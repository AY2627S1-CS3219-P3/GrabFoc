/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-28
 * Scope: Replaced the dev-only header guard with JWT verification against the User Service's
 *        JWKS, keeping the @Roles decorator and the logging of denied attempts.
 * Author review: pending — to be completed by the reviewing team member.
 */
import { CanActivate, ExecutionContext, Injectable, Logger, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { JwksUnavailableError, verifyToken } from './jwks';
import { ProblemException } from './problem';

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
      status,
      method: req.method,
      path: req.originalUrl,
      userId: caller?.id ?? null,
      role: caller?.role ?? null,
    }),
  );
  return new ProblemException(status, detail);
}

/**
 * Every request must carry a bearer token issued by the User Service. The gateway verifies it
 * too, but this service re-verifies rather than trusting whatever reached it over the network.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

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

    const allowed = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed && !allowed.includes(claims.role)) {
      throw denied(req, 403, 'This action requires the ADMIN role.', req.caller);
    }
    return true;
  }
}
