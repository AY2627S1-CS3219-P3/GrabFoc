/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-30
 * Scope: Generated these unit tests for the Problem Details error responses.
 * Author review (Jian Bing): Ran `npm test` on 2026-10-01 (157 passed) and verified each test
 *        case in this file by hand.
 */
import { ArgumentsHost, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { ProblemDetailsFilter, ProblemException } from './problem';

interface Sent {
  status?: number;
  type?: string;
  body?: Record<string, unknown>;
}

function send(exception: unknown, url = '/locations/7'): Sent {
  const sent: Sent = {};
  const res = {
    status(code: number) {
      sent.status = code;
      return res;
    },
    type(value: string) {
      sent.type = value;
      return res;
    },
    json(body: Record<string, unknown>) {
      sent.body = body;
      return res;
    },
  };
  const host = {
    switchToHttp: () => ({ getRequest: () => ({ originalUrl: url }), getResponse: () => res }),
  } as unknown as ArgumentsHost;
  new ProblemDetailsFilter().catch(exception, host);
  return sent;
}

let loggedError: jest.SpyInstance;
beforeEach(() => {
  loggedError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

it('sends a ProblemException as application/problem+json with its status and detail', () => {
  expect(send(new ProblemException(409, 'An ACTIVE location named "X" already exists.'))).toEqual({
    status: 409,
    type: 'application/problem+json',
    body: {
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      detail: 'An ACTIVE location named "X" already exists.',
      instance: '/locations/7',
    },
  });
});

it('uses the standard reason phrase as the title', () => {
  expect(send(new ProblemException(403, 'nope')).body?.title).toBe('Forbidden');
  expect(send(new ProblemException(503, 'down')).body?.title).toBe('Service Unavailable');
});

it("uses Nest's own exceptions' status and message", () => {
  const sent = send(new NotFoundException('Cannot GET /nope'), '/nope');
  expect(sent.status).toBe(404);
  expect(sent.body).toMatchObject({ status: 404, title: 'Not Found', detail: 'Cannot GET /nope', instance: '/nope' });
  expect(send(new BadRequestException()).body).toMatchObject({ status: 400, detail: 'Bad Request' });
});

it('turns any other error into a 500 without revealing its message', () => {
  const sent = send(new Error('password=hunter2 at db.internal:5432'));
  expect(sent.status).toBe(500);
  expect(sent.body).toMatchObject({ status: 500, title: 'Internal Server Error', detail: 'An unexpected error occurred.' });
  expect(JSON.stringify(sent.body)).not.toContain('hunter2');
});

it('logs unexpected errors, but not expected HTTP errors', () => {
  send(new Error('boom'));
  expect(loggedError).toHaveBeenCalledTimes(1);
  send(new ProblemException(404, 'No location with id 7.'));
  expect(loggedError).toHaveBeenCalledTimes(1);
});
