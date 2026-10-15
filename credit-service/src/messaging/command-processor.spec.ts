/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated unit tests for the retry and dead-letter routing of credit commands (spec §9.2).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ErrorCode } from '../common/error-codes';
import { ProblemException } from '../common/problem';
import { CommandProcessor, describeFailure, msUntilDue } from './command-processor';
import { HEADER, InboundMessage, InvalidMessageError } from './messages';
import { buildTopics } from './topics';

const topics = buildTopics([1000, 5000]);
const NOW = 1_800_000_000_000;
const eventId = randomUUID();
const orderId = randomUUID();
const value = JSON.stringify({ type: 'ReleaseCredits', eventId, orderId });

const message = (headers: Record<string, string> = {}, raw: string | null = value): InboundMessage => ({
  topic: topics.commands,
  key: orderId,
  value: raw === null ? null : Buffer.from(raw),
  headers,
});
const failWith = (err: unknown) => jest.fn().mockRejectedValue(err);
const noWallet = () => new ProblemException(404, 'No wallet yet.', ErrorCode.WALLET_NOT_FOUND);

let warn: jest.SpyInstance;
let error: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('CommandProcessor', () => {
  it('applies a valid command and sends nothing further', async () => {
    const apply = jest.fn().mockResolvedValue(undefined);
    expect(await new CommandProcessor(apply, topics).process(message(), NOW)).toBeNull();
    expect(apply).toHaveBeenCalledWith({ type: 'ReleaseCredits', eventId, orderId });
  });

  it('sends a missing-wallet failure to the first retry topic, due after the first delay', async () => {
    const next = await new CommandProcessor(failWith(noWallet()), topics).process(message(), NOW);
    expect(next).toEqual({
      topic: 'credit.commands.retry.0',
      key: orderId,
      value,
      headers: {
        [HEADER.attempt]: '1',
        [HEADER.dueAt]: String(NOW + 1000),
        [HEADER.error]: 'No wallet yet.',
        [HEADER.errorCode]: ErrorCode.WALLET_NOT_FOUND,
        [HEADER.sourceTopic]: 'credit.commands',
      },
    });
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({
      event: 'credit_command_retry_scheduled',
      eventId,
      orderId,
      attempt: 1,
    });
  });

  it('sends the second failure to the second retry topic', async () => {
    const next = await new CommandProcessor(failWith(noWallet()), topics).process(
      message({ [HEADER.attempt]: '1' }),
      NOW,
    );
    expect(next?.topic).toBe('credit.commands.retry.1');
    expect(next?.headers[HEADER.dueAt]).toBe(String(NOW + 5000));
  });

  it('dead-letters a command once its retries run out, and logs it without balances', async () => {
    const next = await new CommandProcessor(failWith(noWallet()), topics).process(
      message({ [HEADER.attempt]: '2' }),
      NOW,
    );
    expect(next).toEqual({
      topic: 'credit.commands.dlt',
      key: orderId,
      value,
      headers: {
        [HEADER.attempt]: '3',
        [HEADER.error]: 'No wallet yet.',
        [HEADER.errorCode]: ErrorCode.WALLET_NOT_FOUND,
        [HEADER.sourceTopic]: 'credit.commands',
        [HEADER.deadLetteredAt]: new Date(NOW).toISOString(),
      },
    });
    expect(JSON.parse(String(error.mock.calls[0][0]))).toEqual({
      event: 'credit_command_dead_lettered',
      eventId,
      orderId,
      attempts: 3,
      code: ErrorCode.WALLET_NOT_FOUND,
    });
  });

  it('dead-letters a permanent conflict at once', async () => {
    const conflict = new ProblemException(409, 'Already released.', ErrorCode.ALREADY_RELEASED);
    const next = await new CommandProcessor(failWith(conflict), topics).process(message(), NOW);
    expect(next?.topic).toBe('credit.commands.dlt');
    expect(next?.headers[HEADER.attempt]).toBe('1');
    expect(next?.headers[HEADER.errorCode]).toBe(ErrorCode.ALREADY_RELEASED);
  });

  it('dead-letters a release with no hold at once, as a bug (K11)', async () => {
    const noHold = new ProblemException(404, 'No hold.', ErrorCode.HOLD_NOT_FOUND);
    const next = await new CommandProcessor(failWith(noHold), topics).process(message(), NOW);
    expect(next?.topic).toBe('credit.commands.dlt');
  });

  // Review Focus 4
  it('retries an unexpected error such as the database being down', async () => {
    const next = await new CommandProcessor(failWith(new Error('connect ECONNREFUSED')), topics).process(
      message(),
      NOW,
    );
    expect(next?.topic).toBe('credit.commands.retry.0');
    expect(next?.headers[HEADER.errorCode]).toBeUndefined();
  });

  // Review Focus 3
  it('dead-letters a message that is not JSON without calling the service', async () => {
    const apply = jest.fn();
    const next = await new CommandProcessor(apply, topics).process(message({}, 'not json'), NOW);
    expect(apply).not.toHaveBeenCalled();
    expect(next?.topic).toBe('credit.commands.dlt');
    expect(next?.value).toBe('not json');
    expect(next?.headers[HEADER.error]).toMatch(/not valid JSON/);
    expect(JSON.parse(String(error.mock.calls[0][0]))).toMatchObject({ eventId: null, orderId: null });
  });

  it('dead-letters at once when no retries are configured', async () => {
    const next = await new CommandProcessor(failWith(noWallet()), buildTopics([])).process(message(), NOW);
    expect(next?.topic).toBe('credit.commands.dlt');
  });
});

describe('describeFailure', () => {
  it('treats an invalid message as permanent', () => {
    expect(describeFailure(new InvalidMessageError('bad'))).toEqual({ retryable: false, message: 'bad' });
  });

  it('treats a missing wallet as retryable', () => {
    expect(describeFailure(noWallet())).toMatchObject({ retryable: true, code: ErrorCode.WALLET_NOT_FOUND });
  });
});

describe('msUntilDue', () => {
  it('is the time left until x-due-at', () => {
    expect(msUntilDue(message({ [HEADER.dueAt]: String(NOW + 250) }), NOW)).toBe(250);
  });

  it('is 0 when due, overdue, missing or unreadable', () => {
    expect(msUntilDue(message({ [HEADER.dueAt]: String(NOW) }), NOW)).toBe(0);
    expect(msUntilDue(message({ [HEADER.dueAt]: String(NOW - 5) }), NOW)).toBe(0);
    expect(msUntilDue(message(), NOW)).toBe(0);
    expect(msUntilDue(message({ [HEADER.dueAt]: 'soon' }), NOW)).toBe(0);
  });
});
