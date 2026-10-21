/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Merged user-service/src/auth/jwt-auth.guard.ts and roles.guard.ts (original disclosures:
 *   Claude Code, Claude Opus 5, 2026-09-25) into one global guard. Same checks, codes and messages.
 * Author review: Successfully reviewed by Deanson, 2026-10-16.
 */
// AI-generated (reviewed by Deanson)
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TokensService } from '../../security/tokens.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';
import type { AuthedRequest } from '../types/auth-user';

/**
 * Registered as APP_GUARD, so every route needs a valid access token unless it is @Public().
 * The role comes from the token and may be up to 15 minutes stale; anything that changes a
 * role or an account re-reads it from the database (ai/open_decisions.md, item 1).
 * Denials are logged by ErrorFilter, not here.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      throw new AppError(401, ErrorCode.TOKEN_INVALID, 'A bearer token is required.');
    }

    let claims;
    try {
      claims = await this.tokens.verifyAccessToken(header.slice('Bearer '.length));
    } catch {
      // Expired, altered, wrong key or algorithm: the caller is told none of it.
      throw new AppError(401, ErrorCode.TOKEN_INVALID, 'The token is invalid or has expired.');
    }
    if (!claims.sub || (claims.role !== Role.USER && claims.role !== Role.ADMIN)) {
      throw new AppError(401, ErrorCode.TOKEN_INVALID, 'The token is invalid or has expired.');
    }
    request.user = { id: claims.sub, role: claims.role };

    const allowed = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (allowed?.length && !allowed.includes(claims.role)) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'This action requires the ADMIN role.');
    }
    return true;
  }
}
