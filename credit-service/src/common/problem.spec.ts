/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated unit tests for the Problem Details filter's error codes.
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Wrote the 2026-10-18 Author review text above from Jian Bing's account of what he checked (PR #97).
 * Author review: Jian Bing supplied what it states; the wording is Claude's.
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
