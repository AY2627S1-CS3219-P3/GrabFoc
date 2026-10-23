/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-23
 * Scope: Generated these unit tests for the per-request log line.
 * Author review: pending — Cole Lin to record what he checked.
 */
import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import type { AuthedRequest, Caller } from './auth';
import { requestLogMiddleware } from './request-log';

// AI-generated (reviewed by Cole Lin).

/** A response that can be finished or dropped, as Express would. */
class FakeResponse extends EventEmitter {
  statusCode = 200;
  writableFinished = false;

  finish(status: number) {
    this.statusCode = status;
    this.writableFinished = true;
    this.emit('finish');
    // Express emits both, in this order, for a response that completed.
    this.emit('close');
  }

  /** The client gave up: `close` fires, `finish` never does. */
  drop(status = 200) {
    this.statusCode = status;
    this.emit('close');
  }
}

let shipped: jest.SpyInstance;

beforeEach(() => {
  // The shipper writes the line itself, so console.log is the real output.
  shipped = jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

function run(
  overrides: Partial<Request> = {},
  caller?: Caller,
): { res: FakeResponse; lines: () => Record<string, unknown>[] } {
  const req = {
    method: 'POST',
    originalUrl: '/locations',
    headers: { 'x-request-id': 'trace-1' },
    ...overrides,
  } as unknown as AuthedRequest;
  if (caller) req.caller = caller;
  const res = new FakeResponse();
  const next = jest.fn() as unknown as NextFunction;
  requestLogMiddleware(req, res as unknown as Response, next);
  expect(next).toHaveBeenCalled();
  return { res, lines: () => shipped.mock.calls.map(([line]) => JSON.parse(line as string)) };
}

describe('a completed request', () => {
  it('writes one line with the method, path, status and duration', () => {
    const { res, lines } = run();
    res.finish(201);

    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toMatchObject({
      service: 'supplier',
      event: 'request_completed',
      requestId: 'trace-1',
      method: 'POST',
      path: '/locations',
      status: 201,
    });
    expect(typeof lines()[0].durationMs).toBe('number');
    expect(lines()[0].durationMs as number).toBeGreaterThanOrEqual(0);
  });

  // The whole point of the change: a success is recorded, not only a refusal.
  it('writes a line for a successful GET', () => {
    const { res, lines } = run({ method: 'GET' } as Partial<Request>);
    res.finish(200);
    expect(lines()[0]).toMatchObject({ event: 'request_completed', method: 'GET', status: 200, level: 'info' });
  });

  it('names the caller when the guard authenticated one', () => {
    const { res, lines } = run({}, { id: 'u-9', role: 'USER' });
    res.finish(403);
    expect(lines()[0]).toMatchObject({ userId: 'u-9', role: 'USER', status: 403 });
  });

  it('leaves the caller out when there was none', () => {
    const { res, lines } = run();
    res.finish(401);
    expect('userId' in lines()[0]).toBe(false);
    expect('role' in lines()[0]).toBe(false);
  });

  it.each([
    [200, 'info'],
    [201, 'info'],
    [400, 'warn'],
    [401, 'warn'],
    [403, 'warn'],
    [404, 'warn'],
    [500, 'error'],
    [503, 'error'],
  ])('logs status %s at level %s', (status, level) => {
    const { res, lines } = run();
    res.finish(status);
    expect(lines()[0].level).toBe(level);
  });

  it('logs the pathname only, never the query string', () => {
    const { res, lines } = run({ originalUrl: '/locations?lat=1.2966&lon=103.7764' } as Partial<Request>);
    res.finish(200);
    expect(lines()[0].path).toBe('/locations');
    expect(JSON.stringify(lines()[0])).not.toContain('103.7764');
  });

  it('mints an id when the request arrived without one', () => {
    const { res, lines } = run({ headers: {} } as Partial<Request>);
    res.finish(200);
    expect(lines()[0].requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  // Express emits finish and then close for a normal response.
  it('writes one line, not two, when both events fire', () => {
    const { res, lines } = run();
    res.finish(200);
    expect(lines()).toHaveLength(1);
  });
});

describe('a request the client gave up on', () => {
  it('still writes a line, marked aborted', () => {
    const { res, lines } = run();
    res.drop();
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toMatchObject({ event: 'request_completed', aborted: true });
  });

  it('does not mark a completed request as aborted', () => {
    const { res, lines } = run();
    res.finish(200);
    expect('aborted' in lines()[0]).toBe(false);
  });
});
