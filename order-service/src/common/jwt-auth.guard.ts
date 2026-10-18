/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated JWKS-based RS256 token verification, the global guard and @CurrentUser,
 *        following user-service/src/auth (token claims `sub` and `role`).
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Skips controllers marked @Internal(), which use the service key instead (Phase D).
 * Author review: Pending review by Zi Yi.
 */
import { CanActivate, ExecutionContext, Injectable, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import { AppError, ErrorCode } from './errors';
import { appConfig } from '../config';
import { INTERNAL } from './service-key.guard';

export type Role = 'USER' | 'ADMIN';
/** The caller, taken only from a verified token, never from the request body. */
export interface Caller {
  id: string;
  role: Role;
}
type AuthedRequest = Request & { caller?: Caller };

const Claims = z.object({ sub: z.string().uuid(), role: z.enum(['USER', 'ADMIN']) });

/** True when the keys could not be fetched, so the token can't be judged either way. */
function isJwksOutage(error: unknown): boolean {
  return (
    !(error instanceof errors.JOSEError) ||
    error instanceof errors.JWKSTimeout ||
    error instanceof errors.JWKSInvalid ||
    error.code === 'ERR_JOSE_GENERIC' // non-200 or non-JSON JWKS response
  );
}

/** Verifies `Authorization: Bearer <jwt>`; 401 for any bad token, 503 if the JWKS is unreachable. */
export async function verifyBearer(header: string | undefined, jwks: JWTVerifyGetKey): Promise<Caller> {
  if (!header?.startsWith('Bearer ')) {
    throw new AppError(401, ErrorCode.TOKEN_INVALID, 'A bearer token is required.');
  }
  let payload: unknown;
  try {
    // Algorithm pinned, so `alg: none` or HS256 tokens are rejected.
    ({ payload } = await jwtVerify(header.slice('Bearer '.length).trim(), jwks, { algorithms: ['RS256'] }));
  } catch (error) {
    if (isJwksOutage(error)) {
      throw new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, 'Cannot verify credentials right now. Try again shortly.');
    }
    throw new AppError(401, ErrorCode.TOKEN_INVALID, 'The token is invalid or has expired.');
  }
  const claims = Claims.safeParse(payload);
  if (!claims.success) throw new AppError(401, ErrorCode.TOKEN_INVALID, 'The token is invalid or has expired.');
  return { id: claims.data.sub, role: claims.data.role };
}

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): Caller => {
  const { caller } = context.switchToHttp().getRequest<AuthedRequest>();
  if (!caller) throw new Error('@CurrentUser used without JwtAuthGuard');
  return caller;
});

/** Registered globally: every route needs a valid token, except @Internal() ones (service key). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  // jose caches the keys and refetches on an unknown `kid`, so User Service key rotation just works.
  private readonly jwks = createRemoteJWKSet(appConfig().jwksUrl);

  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.get<boolean>(INTERNAL, context.getClass())) return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    req.caller = await verifyBearer(req.header('authorization'), this.jwks);
    return true;
  }
}
