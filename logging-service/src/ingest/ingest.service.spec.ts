/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated these unit tests for the ingest path, using an in-process fake consumer and a
 *        stubbed LinesService — the testing approach Cole Lin approved on 2026-10-16 while the
 *        shared broker (#75) is unmerged.
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Added the cases for a line the store will never accept versus a store that is
 *        temporarily down.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Added the dead-letter cases (Kafka rule 6).
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-23
 * Scope: Added the cases for a redacted dead-letter body and a park failure being redelivered.
 * Author review: pending — Cole Lin to record what he checked.
 */
import { Logger } from '@nestjs/common';
import { config } from '../config';
import { LinesService } from '../lines/lines.service';
import { DeadLetters, InboundMessage, LineConsumer, MessageHandler } from './consumer';
import { IngestService } from './ingest.service';

// AI-generated (reviewed by Cole Lin).

/** Stands in for the broker: hands the service messages the way a consumer would. */
class FakeConsumer implements LineConsumer {
  handler?: MessageHandler;
  stopped = false;

  async start(handler: MessageHandler): Promise<void> {
    this.handler = handler;
  }
  async stop(): Promise<void> {
    this.stopped = true;
  }
  deliver(value: string, where: Partial<InboundMessage> = {}): Promise<void> {
    return this.handler!({ value, topic: 'logging.lines', partition: 0, offset: '7', ...where });
  }
}

const line = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    lineId: '3f1c8e9a-5b2d-4e7f-9a1b-2c3d4e5f6a7b',
    ts: '2026-10-16T08:00:25.123Z',
    service: 'supplier',
    level: 'warn',
    event: 'access_denied',
    ...overrides,
  });

let lines: { insert: jest.Mock };
let consumer: FakeConsumer;
let parked: Array<{ message: InboundMessage; reason: string; body: string | null }>;
let deadLetters: DeadLetters & { send: jest.Mock };
let ingest: IngestService;
let warn: jest.SpyInstance;

beforeEach(() => {
  lines = { insert: jest.fn().mockResolvedValue(true) };
  consumer = new FakeConsumer();
  parked = [];
  deadLetters = {
    send: jest.fn(
      async (message: InboundMessage, reason: string, body: string | null) =>
        void parked.push({ message, reason, body }),
    ),
  };
  ingest = new IngestService(lines as unknown as LinesService, consumer, deadLetters);
  warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  config.kafkaBrokers = ['kafka:9092'];
});

afterEach(() => {
  jest.restoreAllMocks();
  config.kafkaBrokers = [];
});

describe('starting up', () => {
  it('consumes when a broker is configured', async () => {
    await ingest.onApplicationBootstrap();
    expect(consumer.handler).toBeDefined();
  });

  // A service with no broker logs to stdout only, so there is nothing to consume. The query API
  // still has to come up.
  it('does not consume when no broker is configured', async () => {
    config.kafkaBrokers = [];
    await ingest.onApplicationBootstrap();
    expect(consumer.handler).toBeUndefined();
  });

  it('says so, rather than failing, when a broker is set but no consumer is wired in (#75)', async () => {
    const withoutConsumer = new IngestService(lines as unknown as LinesService);
    await expect(withoutConsumer.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(warn.mock.calls.flat().join(' ')).toContain('#75');
  });

  it('stops the consumer on shutdown', async () => {
    await ingest.onApplicationBootstrap();
    await ingest.onModuleDestroy();
    expect(consumer.stopped).toBe(true);
  });
});

describe('handling a message', () => {
  beforeEach(() => ingest.onApplicationBootstrap());

  it('stores a valid line', async () => {
    await consumer.deliver(line());
    expect(lines.insert).toHaveBeenCalledTimes(1);
    expect(ingest.counts).toMatchObject({ stored: 1, duplicate: 0, rejected: 0 });
  });

  // Kafka is at-least-once, so this is the normal case, not an error.
  it('counts a line the store already had as a duplicate', async () => {
    lines.insert.mockResolvedValue(false);
    await consumer.deliver(line());
    expect(ingest.counts).toMatchObject({ stored: 0, duplicate: 1 });
  });

  it.each([
    ['not JSON at all', 'this is not json'],
    ['JSON that is not a line', JSON.stringify({ hello: 'world' })],
    ['a line with no lineId', line({ lineId: undefined })],
  ])('drops %s without throwing, so one bad line cannot stop the consumer', async (_why, value) => {
    await expect(consumer.deliver(value)).resolves.toBeUndefined();
    expect(lines.insert).not.toHaveBeenCalled();
    expect(ingest.counts.rejected).toBe(1);
  });

  /**
   * Kafka rule 6: every consumer parks what it cannot handle in its own dead-letter topic, so a
   * bad line can be looked at later instead of only counted.
   */
  it('parks a line it cannot parse in the dead-letter topic', async () => {
    await consumer.deliver('this is not json');
    expect(parked).toHaveLength(1);
    expect(parked[0].reason).toContain('not valid JSON');
    expect(ingest.counts).toMatchObject({ rejected: 1, deadLettered: 1 });
  });

  it('parks a line the store will never accept', async () => {
    lines.insert.mockRejectedValue(Object.assign(new Error('rejected'), { code: '23514' }));
    await consumer.deliver(line());
    expect(parked).toHaveLength(1);
    expect(parked[0].reason).toContain('23514');
  });

  it('does not park a line that was simply redelivered', async () => {
    lines.insert.mockResolvedValue(false);
    await consumer.deliver(line());
    expect(parked).toHaveLength(0);
  });

  /**
   * Swallowing this would let the consumer commit the offset with the line neither stored nor
   * parked — the one outcome worth avoiding (PR #129 review).
   */
  it('rethrows when the dead-letter topic fails, so the line comes back', async () => {
    deadLetters.send.mockRejectedValue(new Error('broker down'));
    await expect(consumer.deliver('not json')).rejects.toThrow('broker down');
    expect(ingest.counts).toMatchObject({ rejected: 1, deadLettered: 0, deadLetterFailed: 1 });
  });

  // A line that failed validation has not been near toRow, so this is the only redaction it gets.
  it('redacts a dead-letter body rather than parking it verbatim', async () => {
    await consumer.deliver(JSON.stringify({ lineId: 'not-a-uuid', password: 'must-not-appear' }));
    expect(parked[0].body).not.toContain('must-not-appear');
    expect(parked[0].body).toContain('[REDACTED]');
  });

  it('redacts a nested secret in a dead-letter body too', async () => {
    await consumer.deliver(JSON.stringify({ lineId: 'nope', req: { headers: { authorization: 'must-not-appear' } } }));
    expect(parked[0].body).not.toContain('must-not-appear');
  });

  // Bytes that are not JSON cannot be inspected field by field, so nothing is parked with them.
  it('parks no body at all when the message was not JSON', async () => {
    await consumer.deliver('this is not json at all');
    expect(parked[0].body).toBeNull();
    expect(parked[0].reason).toContain('not valid JSON');
  });

  /**
   * The rejection is logged before the park is attempted, so the line always appears even if the
   * park then fails; `parked` says whether there is a dead-letter topic at all, and a failure to
   * reach it gets its own `dead_letter_failed` line.
   */
  it('still counts and logs when no dead-letter topic is wired in', async () => {
    const alone = new IngestService(lines as unknown as LinesService, consumer);
    await alone.onApplicationBootstrap();
    await consumer.deliver('not json');
    expect(alone.counts).toMatchObject({ rejected: 1, deadLettered: 0 });
    expect(warn.mock.calls.flat().join(' ')).toContain('"parked":false');
  });

  it('says the line was parked when a dead-letter topic is wired in', async () => {
    await consumer.deliver('not json');
    expect(warn.mock.calls.flat().join(' ')).toContain('"parked":true');
  });

  it('records where a rejected line was, but not what it said', async () => {
    await consumer.deliver(JSON.stringify({ lineId: 'nope', secret: 'hunter2' }));
    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('line_rejected');
    expect(logged).toContain('"offset":"7"');
    expect(logged).not.toContain('hunter2');
  });

  // A database failure is ours, not the message's: let it propagate so the broker redelivers.
  it.each([
    ['a dropped connection', undefined],
    ['a server shutting down', '57P01'],
    ['too many clients', '53300'],
  ])('rethrows after %s, so the broker redelivers the line', async (_why, code) => {
    lines.insert.mockRejectedValue(Object.assign(new Error('connection terminated'), { code }));
    await expect(consumer.deliver(line())).rejects.toThrow('connection terminated');
    expect(ingest.counts).toMatchObject({ stored: 0, failed: 1, rejected: 0 });
  });

  /**
   * A line the database will never accept must not come back forever: redelivering it would loop
   * on the same message and hold up every other service's logging behind it. There is no
   * dead-letter topic for it, deliberately — see "Ingest" in AGENTS.md.
   */
  it.each([
    ['a check constraint', '23514'],
    ['a value too long for its column', '22001'],
    ['a not-null violation', '23502'],
  ])('drops a line the store rejected with %s, without redelivery', async (_why, code) => {
    lines.insert.mockRejectedValue(Object.assign(new Error('rejected'), { code }));
    await expect(consumer.deliver(line())).resolves.toBeUndefined();
    expect(ingest.counts).toMatchObject({ rejected: 1, failed: 0 });
    expect(warn.mock.calls.flat().join(' ')).toContain('SQLSTATE 23514'.slice(0, 9));
  });
});
