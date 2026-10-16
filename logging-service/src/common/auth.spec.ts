/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated these unit tests for the guard: 401/403/503 outcomes, the ADMIN-only rule, and
 *        that the Supplier Service's dev-auth headers buy nothing here.
 * Author review: pending — Cole Lin to record what he checked.
 */
import { ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { config } from '../config';
import { JwksStub, makeKey, signToken } from '../test/jwks-stub';
import { AuthedRequest, JwtAuthGuard, Roles } from './auth';
import { resetJwksCache } from './jwks';
import { ProblemException } from './problem';

class LogsLikeController {
  @Roles('ADMIN')
  adminOnly() {}
}

const key = makeKey('k1');
const stub = new JwksStub();
const guard = new JwtAuthGuard(new Reflector());

function request(headers: Record<string, string> = {}): AuthedRequest {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    headers: lower,
    header: (name: string) => lower[name.toLowerCase()],
    method: 'GET',
    originalUrl: '/logs?requestId=trace-123',
  } as unknown as AuthedRequest;
}

function context(req: AuthedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => LogsLikeController.prototype.adminOnly,
    getClass: () => LogsLikeController,
  } as unknown as ExecutionContext;
}

async function outcome(req: AuthedRequest): Promise<'allowed' | number> {
  try {
    return (await guard.canActivate(context(req))) ? 'allowed' : 403;
  } catch (err) {
    if (err instanceof ProblemException) return err.getStatus();
    throw err;
  }
}

const bearer = (claims: Record<string, unknown>) => ({ Authorization: `Bearer ${signToken(key, claims)}` });
let warn: jest.SpyInstance;

beforeAll(() => stub.start());
afterAll(() => stub.stop());

beforeEach(() => {
  stub.reset([key]);
  resetJwksCache();
  config.jwksUrl = stub.url;
  warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('reading the log store', () => {
  it('lets an ADMIN in', async () => {
    expect(await outcome(request(bearer({ sub: 'u-1', role: 'ADMIN' }))))
      .toBe('allowed');
  });

  // These rows say which user called which path and when, across every service.
  it('refuses a USER with 403', async () => {
    expect(await outcome(request(bearer({ sub: 'u-9', role: 'USER' })))).toBe(403);
  });

  it.each([
    ['no token', {}],
    ['a token that is not a bearer', { Authorization: 'Basic abc' }],
    ['a malformed token', { Authorization: 'Bearer not.a.token' }],
    ['a token signed with an unknown key', { Authorization: `Bearer ${signToken(makeKey('other'), { sub: 'u-1', role: 'ADMIN' })}` }],
    // role: undefined drops the claim, since the stub otherwise defaults it to USER.
    ['a token with no role claim', { Authorization: `Bearer ${signToken(key, { sub: 'u-1', role: undefined })}` }],
    ['a token with a role we do not issue', { Authorization: `Bearer ${signToken(key, { role: 'COURIER' })}` }],
  ])('answers 401 for %s', async (_why, headers) => {
    expect(await outcome(request(headers))).toBe(401);
  });

  it('answers 503, not 401, when the JWKS cannot be reached', async () => {
    await stub.stop();
    resetJwksCache();
    expect(await outcome(request(bearer({ sub: 'u-1', role: 'ADMIN' })))).toBe(503);
    await stub.start();
    config.jwksUrl = stub.url;
  });

  /**
   * The Supplier Service accepts X-User-Id / X-User-Role when SUPPLIER_DEV_AUTH is on, so it can
   * be tested without the User Service. This service has no such mode, deliberately.
   */
  it('ignores the Supplier Service dev-auth headers entirely', async () => {
    expect(await outcome(request({ 'X-User-Id': 'dev-1', 'X-User-Role': 'ADMIN' }))).toBe(401);
  });

  it('logs a denial with the request id and no query string', async () => {
    await outcome(request({ ...bearer({ sub: 'u-9', role: 'USER' }), 'x-request-id': 'trace-123' }));
    const logged = JSON.parse(warn.mock.calls[0][0] as string);
    expect(logged).toMatchObject({
      event: 'access_denied',
      requestId: 'trace-123',
      status: 403,
      path: '/logs',
      userId: 'u-9',
      role: 'USER',
    });
  });

  it('never logs the token', async () => {
    const headers = bearer({ sub: 'u-9', role: 'USER' });
    await outcome(request(headers));
    expect(warn.mock.calls.flat().join(' ')).not.toContain(headers.Authorization.slice(7));
  });
});
