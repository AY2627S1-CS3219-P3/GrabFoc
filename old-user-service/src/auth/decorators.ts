/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated the @Public, @Roles and @CurrentUser decorators.
 * Author review: Read in full; `npm test` passes (67 tests).
 */
import { ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import { AuthedRequest, Caller, Role } from './caller';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/**
 * Opts a route out of authentication.
 *
 * JwtAuthGuard is global, so everything requires a token unless it says otherwise. That way
 * forgetting a decorator leaves an endpoint closed rather than open. Only register, login,
 * refresh, forgot/reset password, the JWKS document and the health check are public.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a route to the given roles. Enforced by RolesGuard (U5.1.1). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Injects the verified caller.
 *
 *   @Get('me') me(@CurrentUser() caller: Caller) { ... }
 *
 * This is the ONLY way a handler should learn who is calling. Taking an id from the body or
 * a path parameter would let anyone act as anyone (root AGENTS.md §8).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Caller => {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    if (!request.caller) {
      // Only reachable if a handler is marked @Public and still asks for the caller.
      throw new Error('@CurrentUser used on a route that does not require authentication.');
    }
    return request.caller;
  },
);
