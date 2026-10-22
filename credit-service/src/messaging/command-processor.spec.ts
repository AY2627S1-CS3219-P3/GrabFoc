/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated unit tests for the retry and dead-letter routing of credit commands (spec §9.2).
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Added tests that retry headers are trusted only on Credit's own retry topics (security review).
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Wrote the 2026-10-18 Author review text above from Jian Bing's account of what he checked (PR #97).
 * Author review: Jian Bing supplied what it states; the wording is Claude's.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
 * Scope: Renamed the HOLD_NOT_FOUND test to a transfer: a release with no hold now saves a marker
 *        (issue #83).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ErrorCode } from '../common/error-codes';
import { ProblemException } from '../common/problem';
import { CommandProcessor, describeFailure, msUntilDue, waitBeforeProcessing } from './command-processor';
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
    expect(await new CommandProcessor(apply, topics).process(message(), () => NOW)).toBeNull();
    expect(apply).toHaveBeenCalledWith({ type: 'ReleaseCredits', eventId, orderId });
  });

  it('sends a missing-wallet failure to the first retry topic, due after the first delay', async () => {
    const next = await new CommandProcessor(failWith(noWallet()), topics).process(message(), () => NOW);
    expect(next).toEqual({
      topic: 'credit.commands.retry.0',
      key: orderId,
      value: Buffer.from(value),
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
      { ...message({ [HEADER.attempt]: '1' }), topic: 'credit.commands.retry.0' },
      () => NOW,
    );
    expect(next?.topic).toBe('credit.commands.retry.1');
    expect(next?.headers[HEADER.dueAt]).toBe(String(NOW + 5000));
  });

  it('dead-letters a command once its retries run out, and logs it without balances', async () => {
    const next = await new CommandProcessor(failWith(noWallet()), topics).process(
      { ...message({ [HEADER.attempt]: '2' }), topic: 'credit.commands.retry.1' },
      () => NOW,
    );
    expect(next).toEqual({
      topic: 'credit.commands.dlt',
      key: orderId,
      value: Buffer.from(value),
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
    const next = await new CommandProcessor(failWith(conflict), topics).process(message(), () => NOW);
    expect(next?.topic).toBe('credit.commands.dlt');
    expect(next?.headers[HEADER.attempt]).toBe('1');
    expect(next?.headers[HEADER.errorCode]).toBe(ErrorCode.ALREADY_RELEASED);
  });

  it('dead-letters a transfer with no hold at once, as a bug (K11)', async () => {
    const noHold = new ProblemException(404, 'No hold.', ErrorCode.HOLD_NOT_FOUND);
    const next = await new CommandProcessor(failWith(noHold), topics).process(message(), () => NOW);
    expect(next?.topic).toBe('credit.commands.dlt');
  });

  // Review Focus 4
  it('retries an unexpected error such as the database being down', async () => {
    const next = await new CommandProcessor(failWith(new Error('connect ECONNREFUSED')), topics).process(
      message(),
      () => NOW,
    );
    expect(next?.topic).toBe('credit.commands.retry.0');
    expect(next?.headers[HEADER.errorCode]).toBeUndefined();
  });

  // Review Focus 3
  it('dead-letters a message that is not JSON without calling the service', async () => {
    const apply = jest.fn();
    const next = await new CommandProcessor(apply, topics).process(message({}, 'not json'), () => NOW);
    expect(apply).not.toHaveBeenCalled();
    expect(next?.topic).toBe('credit.commands.dlt');
    expect(next?.value).toEqual(Buffer.from('not json'));
    expect(next?.headers[HEADER.error]).toMatch(/not valid JSON/);
    expect(JSON.parse(String(error.mock.calls[0][0]))).toMatchObject({ eventId: null, orderId: null });
  });

  // PR #84/#85 review: keep the exact bytes that failed.
  it('dead-letters a command byte for byte, even when it is not valid UTF-8', async () => {
    const bytes = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]);
    const next = await new CommandProcessor(jest.fn(), topics).process({ ...message(), value: bytes }, () => NOW);
    expect(next?.topic).toBe('credit.commands.dlt');
    expect(next?.value).toEqual(bytes);
  });

  it('dead-letters at once when no retries are configured', async () => {
    const next = await new CommandProcessor(failWith(noWallet()), buildTopics([])).process(message(), () => NOW);
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

// Security review: x-attempt and x-due-at are Credit's own headers, meaningful only on its retry topics.
describe('headers from outside Credit', () => {
  it('ignores a forged x-attempt on credit.commands, so the retries still happen', async () => {
    const next = await new CommandProcessor(failWith(noWallet()), topics).process(
      message({ [HEADER.attempt]: '99' }),
      () => NOW,
    );
    expect(next?.topic).toBe('credit.commands.retry.0');
    expect(next?.headers[HEADER.attempt]).toBe('1');
  });

  it('never waits on credit.commands, whatever x-due-at says', () => {
    expect(waitBeforeProcessing(message({ [HEADER.dueAt]: String(NOW + 86_400_000) }), topics, NOW)).toBe(0);
  });

  it('waits on a retry topic, but never longer than that topic’s delay', () => {
    const retry = (dueAt: number): InboundMessage => ({ ...message({ [HEADER.dueAt]: String(dueAt) }), topic: 'credit.commands.retry.1' });
    expect(waitBeforeProcessing(retry(NOW + 3000), topics, NOW)).toBe(3000);
    expect(waitBeforeProcessing(retry(NOW + 86_400_000), topics, NOW)).toBe(5000);
  });
});

// PR #85 review: a dead letter without an event id is recognised by where its original message
// sat in Kafka, which never changes, so a redelivery can't make a second row.
describe('source position', () => {
  it('stamps where the original command sat in credit.commands', async () => {
    const next = await new CommandProcessor(failWith(noWallet()), topics).process(
      { ...message(), partition: 2, offset: '41' },
      () => NOW,
    );
    expect(next?.headers).toMatchObject({ [HEADER.sourcePartition]: '2', [HEADER.sourceOffset]: '41' });
  });

  it('carries the original position through the retry topics', async () => {
    const next = await new CommandProcessor(failWith(noWallet()), topics).process(
      {
        ...message({ [HEADER.attempt]: '1', [HEADER.sourcePartition]: '2', [HEADER.sourceOffset]: '41' }),
        topic: 'credit.commands.retry.0',
        partition: 0,
        offset: '7',
      },
      () => NOW,
    );
    expect(next?.headers).toMatchObject({ [HEADER.sourcePartition]: '2', [HEADER.sourceOffset]: '41' });
  });
});

// PR #85 review: the retry wait starts when the attempt fails, not when it started.
it('measures the retry delay from when the attempt failed, so a slow failure still waits', async () => {
  let time = NOW;
  const slowFailure = jest.fn(async () => {
    time += 5000; // e.g. a database connection attempt that took 5 s to fail
    throw new Error('connect ETIMEDOUT');
  });
  const next = await new CommandProcessor(slowFailure, topics).process(message(), () => time);
  expect(next?.headers[HEADER.dueAt]).toBe(String(NOW + 5000 + 1000));
});

// PR #85 review: per-order ordering relies on the key, so a command keyed by anything else is refused.
it('dead-letters a command whose Kafka key is not its orderId, without applying it', async () => {
  const apply = jest.fn();
  for (const key of [randomUUID(), null]) {
    const next = await new CommandProcessor(apply, topics).process({ ...message(), key }, () => NOW);
    expect(next?.topic).toBe('credit.commands.dlt');
    expect(next?.headers[HEADER.error]).toMatch(/key/);
  }
  expect(apply).not.toHaveBeenCalled();
});

it('accepts a key that differs from orderId only in letter case', async () => {
  const apply = jest.fn().mockResolvedValue(undefined);
  expect(await new CommandProcessor(apply, topics).process({ ...message(), key: orderId.toUpperCase() }, () => NOW)).toBeNull();
});
