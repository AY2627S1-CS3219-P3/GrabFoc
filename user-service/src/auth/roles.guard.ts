/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated the role check for @Roles-decorated routes.
 * Author review: Read in full; `npm test` passes (67 tests).
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError } from '../common/app-error';
import { ErrorCode } from '../common/error-codes';
import { AuthedRequest, Role } from './caller';
import { ROLES_KEY } from './decorators';

/**
 * Enforces @Roles. Runs after JwtAuthGuard, so `caller` is already set; a route with no
 * @Roles is left alone.
 *
 * The role here comes from the token and may be up to 15 minutes stale. That is fine for
 * reads, but anything that CHANGES a role or an account must re-read the role from the
 * database inside its transaction (AGENTS.md, "The last-admin lock").
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowed?.length) return true;

    const { caller } = context.switchToHttp().getRequest<AuthedRequest>();
    if (!caller) {
      throw new AppError(401, ErrorCode.TOKEN_INVALID, 'A bearer token is required.');
    }
    if (!allowed.includes(caller.role)) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'This action requires the ADMIN role.');
    }
    return true;
  }
}
