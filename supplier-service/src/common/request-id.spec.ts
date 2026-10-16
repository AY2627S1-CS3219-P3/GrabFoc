/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated these unit tests for the correlation-id helpers and for the requestId field
 *        in the access_denied log.
 * Author review (Cole Lin): Read in full; ran `npm test` (171 passed) and checked a supplied id,
 *        a minted one and a rejected one all reach the log line and the response header.
 */
import { ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { AuthedRequest, JwtAuthGuard } from './auth';
import { requestIdMiddleware, requestIdOf, resolveRequestId } from './request-id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('resolveRequestId', () => {
  it('keeps a well-formed header, so the gateway id is the one logged', () => {
    expect(resolveRequestId('abc-123_X.4:9')).toBe('abc-123_X.4:9');
  });

  it('mints an id when the header is absent, so direct calls stay joinable', () => {
    expect(resolveRequestId(undefined)).toMatch(UUID);
  });

  it('takes the first value of a repeated header', () => {
    expect(resolveRequestId(['first', 'second'])).toBe('first');
  });

  // Envoy drops the Node gateway's length and charset rule and can pass a caller's id through
  // unchanged (api-gateway/envoy/behaviour-differences.md), so this service is the only check.
  it.each([
    ['over 128 characters', 'x'.repeat(129)],
    ['spaces', 'has spaces'],
    ['a newline', 'line\nbreak'],
    ['an unsafe path', 'unsafe/id'],
    ['empty', ''],
  ])('replaces a header with %s rather than rejecting the request', (_why, value) => {
    expect(resolveRequestId(value)).toMatch(UUID);
  });
});

describe('requestIdMiddleware', () => {
  function run(headers: Record<string, string>) {
    const sent: Record<string, string> = {};
    const req = { headers } as unknown as Request;
    const res = { setHeader: (name: string, value: string) => (sent[name] = value) } as unknown as Response;
    const next = jest.fn() as unknown as NextFunction;
    requestIdMiddleware(req, res, next);
    return { req, sent, next };
  }

  it('stores the id, echoes it back and continues', () => {
    const { req, sent, next } = run({ 'x-request-id': 'cole-test-1' });
    expect(requestIdOf(req)).toBe('cole-test-1');
    expect(sent['x-request-id']).toBe('cole-test-1');
    expect(next).toHaveBeenCalled();
  });

  it('echoes back the same id it minted, so a reply can be traced', () => {
    const { req, sent } = run({});
    expect(sent['x-request-id']).toMatch(UUID);
    expect(sent['x-request-id']).toBe(requestIdOf(req));
  });
});

it('gives a log site an id even when the middleware did not run', () => {
  expect(requestIdOf({} as Request)).toMatch(UUID);
});

// The guard's own outcomes are covered in auth.spec.ts; this is only about the logged id.
describe('the requestId in the access_denied log', () => {
  const guard = new JwtAuthGuard(new Reflector());
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  /** Denies an unauthenticated request and returns the line the guard logged. */
  async function deniedLine(headers: Record<string, string>) {
    const req = { headers, header: () => undefined, method: 'POST', originalUrl: '/locations' } as unknown as AuthedRequest;
    requestIdMiddleware(req, { setHeader: () => undefined } as unknown as Response, (() => undefined) as NextFunction);
    await guard
      .canActivate({
        switchToHttp: () => ({ getRequest: () => req }),
        getHandler: () => () => undefined,
        getClass: () => class {},
      } as unknown as ExecutionContext)
      .catch(() => undefined);
    return JSON.parse(warn.mock.calls[0][0] as string);
  }

  it('carries the caller-supplied id through to the log line', async () => {
    expect(await deniedLine({ 'x-request-id': 'trace-123' })).toMatchObject({
      event: 'access_denied',
      requestId: 'trace-123',
      status: 401,
      method: 'POST',
      path: '/locations',
    });
  });

  it('logs a minted id when none was supplied', async () => {
    expect((await deniedLine({})).requestId).toMatch(UUID);
  });

  it('is unaffected by the dev-auth fallback', async () => {
    const devAuth = config.devAuth;
    (config as { devAuth: boolean }).devAuth = true;
    try {
      expect((await deniedLine({ 'x-request-id': 'dev-trace' })).requestId).toBe('dev-trace');
    } finally {
      (config as { devAuth: boolean }).devAuth = devAuth;
    }
  });
});
