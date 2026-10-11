/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
 * Scope: Generated unit tests for the service-key guard.
 * Author review: pending — Jian Bing to record what he checked.
 */
import { ExecutionContext, Logger } from '@nestjs/common';
import { ProblemException } from './problem';
import { keysMatch, ServiceKeyGuard } from './service-key.guard';

const KEY = process.env.CREDIT_SERVICE_KEY!;

function contextWith(headers: Record<string, string>): ExecutionContext {
  const req = {
    method: 'POST',
    originalUrl: '/internal/credits/reserve',
    header: (name: string) => headers[name.toLowerCase()],
  };
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

describe('ServiceKeyGuard', () => {
  const guard = new ServiceKeyGuard();
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('lets the correct key through', () => {
    expect(guard.canActivate(contextWith({ 'x-service-key': KEY }))).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['no key', {}],
    ['a wrong key of the same length', { 'x-service-key': KEY.replace(/.$/, 'X') }],
    ['a shorter key', { 'x-service-key': 'short' }],
    ['an empty key', { 'x-service-key': '' }],
  ])('rejects %s with 401 and logs it without the key', (_label, headers) => {
    try {
      guard.canActivate(contextWith(headers));
      throw new Error('expected a ProblemException');
    } catch (err) {
      expect(err).toBeInstanceOf(ProblemException);
      expect((err as ProblemException).getStatus()).toBe(401);
    }
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = String(warn.mock.calls[0][0]);
    expect(JSON.parse(logged)).toMatchObject({ event: 'access_denied', status: 401 });
    if ('x-service-key' in headers && headers['x-service-key']) {
      expect(logged).not.toContain((headers as Record<string, string>)['x-service-key']);
    }
  });
});

describe('keysMatch', () => {
  it('compares keys of different lengths without throwing', () => {
    expect(keysMatch('a', 'a much longer key')).toBe(false);
    expect(keysMatch('same', 'same')).toBe(true);
  });
});
