/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-30
 * Scope: Generated these unit tests for the auth guard: 401/403/503 outcomes, role checks,
 *        the dev-auth header fallback and the access_denied log.
 * Author review (Jian Bing): Ran `npm test` on 2026-10-01 (157 passed) and verified each test
 *        case in this file by hand.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Added requestId to the two access_denied expectations after the log line gained
 *        that field; no other change. The field itself is tested in request-id.spec.ts.
 * Author review (Cole Lin): Checked the change is only the added field.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: The denial line now goes through the shipper rather than Nest's logger, so these
 *        read the shipped line and assert the fields it adds (issue #52).
 * Author review: Cole Lin, read and approved.
 */
import { ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { config } from '../config';
import { JwksStub, makeKey, signToken } from '../test/jwks-stub';
import { AuthedRequest, JwtAuthGuard, Roles } from './auth';
import { resetJwksCache } from './jwks';
import { ProblemException } from './problem';

class LocationsLikeController {
  open() {}
  @Roles('ADMIN')
  adminOnly() {}
}

const key = makeKey('k1');
const stub = new JwksStub();
const guard = new JwtAuthGuard(new Reflector());

function request(headers: Record<string, string> = {}): AuthedRequest {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { header: (name: string) => lower[name.toLowerCase()], method: 'GET', originalUrl: '/locations' } as unknown as AuthedRequest;
}

function context(req: AuthedRequest, handler: 'open' | 'adminOnly' = 'open'): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => LocationsLikeController.prototype[handler],
    getClass: () => LocationsLikeController,
  } as unknown as ExecutionContext;
}

/** Runs the guard; returns 'allowed' or the HTTP status it threw. */
async function outcome(req: AuthedRequest, handler: 'open' | 'adminOnly' = 'open'): Promise<'allowed' | number> {
  try {
    return (await guard.canActivate(context(req, handler))) ? 'allowed' : 403;
  } catch (err) {
    if (err instanceof ProblemException) return err.getStatus();
    throw err;
  }
}

const bearer = (claims: Record<string, unknown>) => ({ Authorization: `Bearer ${signToken(key, claims)}` });
// The shipper writes the line itself, so the machine-readable JSON is not wrapped in Nest's
// human-readable prefix: capturing console.log is capturing the real output.
let shipped: jest.SpyInstance;

beforeAll(() => stub.start());
afterAll(() => stub.stop());

beforeEach(() => {
  stub.reset([key]);
  resetJwksCache();
  config.jwksUrl = stub.url;
  config.devAuth = false;
  shipped = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('with a bearer token', () => {
  it('lets a USER through to an open route and records who is calling', async () => {
    const req = request(bearer({ sub: 'u-1', role: 'USER' }));
    expect(await outcome(req)).toBe('allowed');
    expect(req.caller).toEqual({ id: 'u-1', role: 'USER' });
  });

  it('lets an ADMIN through to an admin-only route', async () => {
    expect(await outcome(request(bearer({ role: 'ADMIN' })), 'adminOnly')).toBe('allowed');
  });

  it('refuses a USER on an admin-only route with 403', async () => {
    expect(await outcome(request(bearer({ role: 'USER' })), 'adminOnly')).toBe(403);
  });

  it('refuses a request with no token with 401', async () => {
    expect(await outcome(request())).toBe(401);
  });

  it('refuses an invalid token with 401', async () => {
    expect(await outcome(request({ Authorization: 'Bearer not.a.token' }))).toBe(401);
  });

  it.each(['SUPERUSER', 'admin', ''])('refuses a validly signed token with role %p with 401', async (role) => {
    expect(await outcome(request(bearer({ role })))).toBe(401);
  });

  it('answers 503 when the JWKS cannot be fetched, rather than 401', async () => {
    stub.respond = () => ({ status: 500, body: 'down' });
    expect(await outcome(request(bearer({ role: 'USER' })))).toBe(503);
  });
});

describe('the access_denied log', () => {
  const logged = () => shipped.mock.calls.map(([line]) => JSON.parse(line as string));

  // An anonymous denial has no caller, so userId and role are absent rather than null: those
  // columns are nullable, and a line carries only what the event had.
  it('records a 401 with the method and path but no caller', async () => {
    await outcome(request());
    expect(logged()).toEqual([
      {
        lineId: expect.any(String),
        ts: expect.any(String),
        service: 'supplier',
        level: 'warn',
        event: 'access_denied',
        requestId: expect.any(String),
        status: 401,
        method: 'GET',
        path: '/locations',
      },
    ]);
  });

  it('records a 403 with the caller', async () => {
    await outcome(request(bearer({ sub: 'u-9', role: 'USER' })), 'adminOnly');
    expect(logged()).toEqual([
      {
        lineId: expect.any(String),
        ts: expect.any(String),
        service: 'supplier',
        level: 'warn',
        event: 'access_denied',
        requestId: expect.any(String),
        status: 403,
        method: 'GET',
        path: '/locations',
        userId: 'u-9',
        role: 'USER',
      },
    ]);
  });

  it('stamps the line with a timestamp the store will accept', async () => {
    await outcome(request());
    const { ts } = logged()[0];
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  it('never includes the token', async () => {
    const headers = bearer({ role: 'USER' });
    await outcome(request(headers), 'adminOnly');
    expect(shipped.mock.calls.flat().join(' ')).not.toContain(headers.Authorization.slice(7));
  });
});

describe('dev-auth header fallback', () => {
  const devHeaders = { 'X-User-Id': 'dev-1', 'X-User-Role': 'ADMIN' };

  it('is ignored when dev auth is off', async () => {
    expect(await outcome(request(devHeaders), 'adminOnly')).toBe(401);
  });

  it('accepts the headers when dev auth is on and no token is sent', async () => {
    config.devAuth = true;
    const req = request(devHeaders);
    expect(await outcome(req, 'adminOnly')).toBe('allowed');
    expect(req.caller).toEqual({ id: 'dev-1', role: 'ADMIN' });
  });

  it('still applies role checks to header callers', async () => {
    config.devAuth = true;
    expect(await outcome(request({ 'X-User-Id': 'dev-2', 'X-User-Role': 'USER' }), 'adminOnly')).toBe(403);
  });

  it.each<[Record<string, string>, string]>([
    [{ 'X-User-Role': 'ADMIN' }, 'no id'],
    [{ 'X-User-Id': 'dev-3' }, 'no role'],
    [{ 'X-User-Id': 'dev-3', 'X-User-Role': 'ROOT' }, 'an unknown role'],
  ])('refuses %p (%s) with 401', async (headers) => {
    config.devAuth = true;
    expect(await outcome(request(headers))).toBe(401);
  });

  it('never lets headers override a real token', async () => {
    config.devAuth = true;
    const req = request({ ...bearer({ sub: 'u-1', role: 'USER' }), ...devHeaders });
    expect(await outcome(req, 'adminOnly')).toBe(403);
    expect(req.caller).toEqual({ id: 'u-1', role: 'USER' });
  });

  it('does not fall back to headers when the token is invalid', async () => {
    config.devAuth = true;
    expect(await outcome(request({ Authorization: 'Bearer not.a.token', ...devHeaders }), 'adminOnly')).toBe(401);
  });
});
