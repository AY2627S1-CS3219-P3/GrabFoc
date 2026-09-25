/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated the global authentication guard.
 * Author review: Read in full; `npm test` passes (67 tests).
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError } from '../common/app-error';
import { ErrorCode } from '../common/error-codes';
import { AuthedRequest, Role } from './caller';
import { IS_PUBLIC_KEY } from './decorators';
import { JwtService } from './jwt.service';

/**
 * Verifies the bearer token and attaches the caller.
 *
 * Registered globally, so a route is authenticated unless it is marked @Public — the safe
 * default, since forgetting a decorator then closes an endpoint rather than exposing one.
 *
 * Denials are not logged here: ErrorFilter logs every 401 and 403 in one place, so no guard
 * can forget to (U5.1.1, U5.2.2).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      throw new AppError(401, ErrorCode.TOKEN_INVALID, 'A bearer token is required.');
    }

    let claims;
    try {
      claims = await this.jwt.verifyAccessToken(header.slice('Bearer '.length));
    } catch {
      // Expired, altered, wrong key, wrong algorithm — the caller is told none of it, so
      // the endpoint cannot be used to probe how tokens are signed.
      throw new AppError(401, ErrorCode.TOKEN_INVALID, 'The token is invalid or has expired.');
    }

    if (!claims.sub || (claims.role !== Role.USER && claims.role !== Role.ADMIN)) {
      throw new AppError(401, ErrorCode.TOKEN_INVALID, 'The token is invalid or has expired.');
    }

    request.caller = { id: claims.sub, role: claims.role };
    return true;
  }
}
