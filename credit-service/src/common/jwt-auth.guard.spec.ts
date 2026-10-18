/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated unit tests for the JWT guard on the balance route.
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Added the query-string logging test (PR #48/#73 review).
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Wrote the 2026-10-18 Author review text above from Jian Bing's account of what he checked (PR #97).
 * Author review: Jian Bing supplied what it states; the wording is Claude's.
 */
import { ExecutionContext, Logger } from '@nestjs/common';
import { config } from '../config';
import { JwksStub, makeKey, signToken } from '../test/jwks-stub';
import { resetJwksCache } from './jwks';
import { AuthedRequest, JwtAuthGuard } from './jwt-auth.guard';
import { ProblemException } from './problem';

const stub = new JwksStub();
const key = makeKey('k1');
const guard = new JwtAuthGuard();
let warn: jest.SpyInstance;
let error: jest.SpyInstance;

beforeAll(() => stub.start());
afterAll(() => stub.stop());
beforeEach(() => {
  stub.reset([key]);
  config.jwksUrl = stub.url;
  resetJwksCache();
  warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  warn.mockRestore();
  error.mockRestore();
});

function request(authorization?: string, originalUrl = '/credits/x') {
  const req = {
    method: 'GET',
    originalUrl,
    header: (name: string) => (name.toLowerCase() === 'authorization' ? authorization : undefined),
  } as unknown as AuthedRequest;
  const context = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
  return { req, context };
}

async function statusOf(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ProblemException) return err.getStatus();
    throw err;
  }
  throw new Error('expected a ProblemException');
}

it('accepts a valid token and records the caller', async () => {
  const { req, context } = request(`Bearer ${signToken(key, { sub: 'u-1', role: 'ADMIN' })}`);
  expect(await guard.canActivate(context)).toBe(true);
  expect(req.caller).toEqual({ id: 'u-1', role: 'ADMIN' });
});

it.each([
  ['no Authorization header', undefined],
  ['an expired token', () => `Bearer ${signToken(key, { exp: 1 })}`],
  ['a token signed by an unpublished key', () => `Bearer ${signToken(makeKey('k1'))}`],
  ['an unknown role', () => `Bearer ${signToken(key, { role: 'SUPERUSER' })}`],
  ['a service key instead of a token', 'test-service-key-0123456789abcdef0123456789abcdef'],
])('rejects %s with 401 and logs access_denied', async (_label, auth) => {
  const { context } = request(typeof auth === 'function' ? auth() : auth);
  expect(await statusOf(guard.canActivate(context))).toBe(401);
  expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({ event: 'access_denied', status: 401 });
});

// Review Focus 4: the User Service being down is not the caller's fault.
it('answers 503 when the JWKS cannot be fetched', async () => {
  stub.respond = () => ({ status: 500, body: 'down' });
  const { context } = request(`Bearer ${signToken(key)}`);
  expect(await statusOf(guard.canActivate(context))).toBe(503);
});

// PR #48/#73 review: a query string can carry a secret, so it never reaches the log.
it('logs a denied request by its path only, without the query string', async () => {
  const { context } = request(undefined, '/credits/x?token=secret-123');
  await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ProblemException);
  const logged = String(warn.mock.calls[0][0]);
  expect(JSON.parse(logged).path).toBe('/credits/x');
  expect(logged).not.toContain('secret-123');
});
