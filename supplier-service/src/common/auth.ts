/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-22
 * Scope: Generated the DEV-ONLY role check (X-User-Id / X-User-Role headers), the @Roles decorator,
 *        and logging of denied attempts. Temporary, as decided by the team, until identity is decided.
 * Author review: pending — to be completed by the reviewing team member.
 */
import { CanActivate, ExecutionContext, Injectable, Logger, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
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
 * DEV-ONLY: trusts the X-User-Id and X-User-Role headers so the service can be tested in Postman
 * before the User Service and gateway exist. Replace once the team decides how identity reaches
 * the Supplier Service (see the root AGENTS.md).
 */
@Injectable()
export class DevRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const id = req.header('x-user-id');
    const role = req.header('x-user-role');
    if (!id || (role !== 'ADMIN' && role !== 'USER')) {
      throw denied(req, 401, 'Missing or invalid credentials.');
    }
    req.caller = { id, role };

    const allowed = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed && !allowed.includes(role)) {
      throw denied(req, 403, 'This action requires the ADMIN role.', req.caller);
    }
    return true;
  }
}
