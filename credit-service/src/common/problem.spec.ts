/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated unit tests for the Problem Details filter's error codes.
 * Author review: pending — Jian Bing to record what he checked.
 */
import { ArgumentsHost } from '@nestjs/common';
import { ErrorCode } from './error-codes';
import { ProblemDetailsFilter, ProblemException } from './problem';

function run(exception: unknown) {
  const res = { status: jest.fn(), type: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.type.mockReturnValue(res);
  const host = {
    switchToHttp: () => ({ getRequest: () => ({ originalUrl: '/x' }), getResponse: () => res }),
  } as unknown as ArgumentsHost;
  new ProblemDetailsFilter().catch(exception, host);
  return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
}

it('adds the code to the body when one is given', () => {
  const { status, body } = run(new ProblemException(409, 'Insufficient credits.', ErrorCode.INSUFFICIENT_CREDITS));
  expect(status).toBe(409);
  expect(body).toMatchObject({ status: 409, detail: 'Insufficient credits.', code: 'INSUFFICIENT_CREDITS' });
});

it('leaves the code out when none is given', () => {
  const { body } = run(new ProblemException(400, 'Bad input.'));
  expect(body).not.toHaveProperty('code');
});
