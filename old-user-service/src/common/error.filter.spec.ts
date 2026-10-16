/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated unit tests for the denial audit log and the error envelope.
 * Author review: pending — to be completed before merge.
 */
import { ArgumentsHost, Logger } from '@nestjs/common';
import { AppError } from './app-error';
import { ErrorCode } from './error-codes';
import { ErrorFilter } from './error.filter';

/** A minimal ArgumentsHost carrying one request and capturing the response. */
function hostFor(request: Record<string, unknown>) {
  const sent: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: unknown) {
      sent.body = body;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => res }),
  } as unknown as ArgumentsHost;
  return { host, sent };
}

describe('ErrorFilter denial logging', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });
  afterEach(() => warn.mockRestore());

  it('does not write the query string into the audit log', () => {
    // GET /admin/users?email=… is the documented admin search. Logging req.originalUrl put
    // the address in the log verbatim, and redaction matches field names — it cannot reach
    // inside a URL string (NFR5.1).
    const { host } = hostFor({
      method: 'GET',
      path: '/admin/users',
      originalUrl: '/admin/users?email=alex@u.nus.edu&status=ACTIVE',
      caller: { id: 'user-1', role: 'USER' },
    });

    new ErrorFilter().catch(new AppError(403, ErrorCode.FORBIDDEN, 'Admins only.'), host);

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain('alex@u.nus.edu');
    expect(logged).not.toContain('?email=');
    // Still useful: the route and the caller survive.
    expect(logged).toContain('/admin/users');
    expect(logged).toContain('user-1');
  });

  it('logs 401 denials too, with no caller', () => {
    const { host } = hostFor({ method: 'GET', path: '/users/me', originalUrl: '/users/me' });
    new ErrorFilter().catch(new AppError(401, ErrorCode.TOKEN_INVALID, 'No token.'), host);
    expect(JSON.stringify(warn.mock.calls)).toContain('UNAUTHORISED_ACCESS');
  });

  it('does not log ordinary errors as denials', () => {
    const { host } = hostFor({ method: 'POST', path: '/auth/register', originalUrl: '/auth/register' });
    new ErrorFilter().catch(new AppError(409, ErrorCode.EMAIL_TAKEN, 'Taken.'), host);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('ErrorFilter response body', () => {
  it('carries the machine-readable code the frontend switches on', () => {
    const { host, sent } = hostFor({ method: 'GET', path: '/x', originalUrl: '/x' });
    new ErrorFilter().catch(
      new AppError(429, ErrorCode.RATE_LIMITED, 'Too many.', { retryAfterSeconds: 840 }),
      host,
    );
    expect(sent.status).toBe(429);
    expect(sent.body).toEqual({
      error: { code: 'RATE_LIMITED', message: 'Too many.', details: { retryAfterSeconds: 840 } },
    });
  });

  it('tells the caller nothing about an unexpected failure', () => {
    const { host, sent } = hostFor({ method: 'GET', path: '/x', originalUrl: '/x' });
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    new ErrorFilter().catch(new Error('connection string postgres://foc:secret@db'), host);
    expect(sent.status).toBe(500);
    expect(JSON.stringify(sent.body)).not.toContain('secret');
    expect((sent.body as { error: { code: string } }).error.code).toBe('INTERNAL_ERROR');
  });
});
