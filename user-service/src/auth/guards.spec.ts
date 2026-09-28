/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated unit tests for JwtAuthGuard and RolesGuard.
 * Author review: Read in full; `npm test` passes (67 tests).
 */
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError } from '../common/app-error';
import { AuthedRequest, Role } from './caller';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtService } from './jwt.service';
import { RolesGuard } from './roles.guard';

const jwt = new JwtService();

/** A minimal ExecutionContext carrying one request and one piece of route metadata. */
function contextFor(request: Partial<AuthedRequest>, metadata: Record<string, unknown> = {}) {
  const req = {
    header: (name: string) => (request as never as Record<string, string>)[name.toLowerCase()],
    ...request,
  } as AuthedRequest;

  const reflector = {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;

  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;

  return { req, reflector, context };
}

const withBearer = (token: string) => ({ authorization: `Bearer ${token}` }) as never;

describe('JwtAuthGuard', () => {
  it('lets a @Public route through without a token', async () => {
    const { reflector, context } = contextFor({}, { [IS_PUBLIC_KEY]: true });
    await expect(new JwtAuthGuard(reflector, jwt).canActivate(context)).resolves.toBe(true);
  });

  it('rejects a protected route with no Authorization header', async () => {
    const { reflector, context } = contextFor({});
    await expect(new JwtAuthGuard(reflector, jwt).canActivate(context)).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
  });

  it('rejects a header that is not a bearer token', async () => {
    const { reflector, context } = contextFor({ authorization: 'Basic abc' } as never);
    await expect(new JwtAuthGuard(reflector, jwt).canActivate(context)).rejects.toBeInstanceOf(AppError);
  });

  it('rejects a token that is not ours', async () => {
    const { reflector, context } = contextFor(withBearer('not.a.real.token'));
    await expect(new JwtAuthGuard(reflector, jwt).canActivate(context)).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
  });

  it('attaches the caller from a valid token', async () => {
    const token = await jwt.signAccessToken('user-1', Role.ADMIN);
    const { req, reflector, context } = contextFor(withBearer(token));
    await expect(new JwtAuthGuard(reflector, jwt).canActivate(context)).resolves.toBe(true);
    expect(req.caller).toEqual({ id: 'user-1', role: 'ADMIN' });
  });

  it('says nothing about why a token failed', async () => {
    // A message distinguishing "expired" from "wrong signature" would tell an attacker
    // which half of their guess was right.
    const { reflector, context } = contextFor(withBearer('not.a.real.token'));
    await expect(new JwtAuthGuard(reflector, jwt).canActivate(context)).rejects.toThrow(
      'The token is invalid or has expired.',
    );
  });
});

describe('RolesGuard', () => {
  const caller = { id: 'user-1', role: Role.USER };

  it('ignores routes with no @Roles', () => {
    const { reflector, context } = contextFor({ caller });
    expect(new RolesGuard(reflector).canActivate(context)).toBe(true);
  });

  it('allows a caller whose role is listed', () => {
    const { reflector, context } = contextFor(
      { caller: { id: 'a', role: Role.ADMIN } },
      { [ROLES_KEY]: [Role.ADMIN] },
    );
    expect(new RolesGuard(reflector).canActivate(context)).toBe(true);
  });

  it('gives a USER 403 on an ADMIN route (U5.1.1)', () => {
    const { reflector, context } = contextFor({ caller }, { [ROLES_KEY]: [Role.ADMIN] });
    expect(() => new RolesGuard(reflector).canActivate(context)).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }) as Error,
    );
  });

  it('gives 401, not 403, when there is no caller at all', () => {
    const { reflector, context } = contextFor({}, { [ROLES_KEY]: [Role.ADMIN] });
    expect(() => new RolesGuard(reflector).canActivate(context)).toThrow(
      expect.objectContaining({ code: 'TOKEN_INVALID' }) as Error,
    );
  });
});
