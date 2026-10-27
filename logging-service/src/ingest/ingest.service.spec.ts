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
 * Author review: Cole Lin, read and approved.
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
let errored: jest.SpyInstance;

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
  errored = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
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

  /**
   * Both providers are @Optional(), so a consumer without a dead-letter sink is a configuration
   * this service can be handed. It must not consume in it: reject() has nowhere to park a message
   * it cannot store, so handle() resolves, the offset is committed, and the line is gone from the
   * pipeline - the one outcome the parking path exists to prevent. Not consuming leaves the line
   * in the topic for Kafka's retention, and the query API still comes up (PR #129 review).
   */
  it('does not consume when a consumer is wired in but no dead-letter topic is', async () => {
    const withoutSink = new IngestService(lines as unknown as LinesService, consumer);
    await expect(withoutSink.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(consumer.handler).toBeUndefined();
    expect(errored.mock.calls.flat().join(' ')).toContain('DEAD_LETTERS');
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

  /**
   * Zod's own message quotes the value it received, so an enum field carrying a token would put it
   * in the rejection line and in the dead-letter header - outside the body's redaction entirely
   * (PR #129 review).
   */
  it('names the field and the rule, never the value it saw', async () => {
    await consumer.deliver(
      JSON.stringify({
        lineId: '3f1c8e9a-5b2d-4e7f-9a1b-2c3d4e5f6a7b',
        ts: '2026-10-23T08:00:00.000Z',
        service: 'supplier',
        level: 'warn',
        event: 'access_denied',
        role: 'Bearer eyJhbGciOiJSUzI1NiJ9.must-not-appear',
      }),
    );
    expect(parked[0].reason).toContain('role');
    expect(parked[0].reason).not.toContain('must-not-appear');
    expect(warn.mock.calls.flat().join(' ')).not.toContain('must-not-appear');
  });

  /**
   * The body is the payload's *shape*, not its contents: a line that failed validation failed
   * because a field held something unexpected, and name-based redaction cannot see a credential
   * in a field like `role` that nobody would list as sensitive (PR #129 review).
   */
  it('parks the shape of a dead letter, never its values', async () => {
    await consumer.deliver(JSON.stringify({ lineId: 'not-a-uuid', password: 'must-not-appear' }));
    expect(parked[0].body).not.toContain('must-not-appear');
    expect(JSON.parse(parked[0].body as string)).toEqual({ lineId: 'string(10)', password: 'string(15)' });
  });

  it('parks no value from a field redaction would not know to redact', async () => {
    await consumer.deliver(
      JSON.stringify({ lineId: 'nope', role: 'Bearer eyJhbGciOiJSUzI1NiJ9.must-not-appear' }),
    );
    expect(parked[0].body).not.toContain('must-not-appear');
    expect(parked[0].body).toContain('role');
  });

  /**
   * A key is as caller-controlled as a value: `{ "Bearer eyJ...": "x" }` carried the token into
   * the body as a field name even once the values were reduced to types (PR #129 review).
   */
  it('does not copy a field name that cannot be a real field name', async () => {
    await consumer.deliver(
      JSON.stringify({ lineId: 'nope', 'Bearer eyJhbGciOiJSUzI1NiJ9.must-not-appear': 'x' }),
    );
    expect(parked[0].body).not.toContain('must-not-appear');
    expect(parked[0].body).not.toContain('Bearer');
    // Position and length, so two unsafe keys stay distinguishable without either being shown.
    expect(parked[0].body).toContain('chars]');
    // A name a producer would plausibly write is kept, because that is the diagnostic value.
    expect(parked[0].body).toContain('lineId');
  });

  it('keeps ordinary field names, including ones redaction would blank', async () => {
    await consumer.deliver(JSON.stringify({ lineId: 'nope', user_id: 'u-1', 'req.path': '/x' }));
    expect(JSON.parse(parked[0].body as string)).toEqual({
      lineId: 'string(4)',
      user_id: 'string(3)',
      'req.path': 'string(2)',
    });
  });

  it('describes a nested object without descending for ever', async () => {
    await consumer.deliver(
      JSON.stringify({ lineId: 'nope', a: { b: { c: { d: { e: { secret: 'must-not-appear' } } } } } }),
    );
    expect(parked[0].body).not.toContain('must-not-appear');
    expect(parked[0].body).toContain('[TRUNCATED]');
  });

  it('describes an array by its length and first element', async () => {
    await consumer.deliver(JSON.stringify({ lineId: 'nope', tags: ['must-not-appear', 'x'] }));
    expect(parked[0].body).not.toContain('must-not-appear');
    expect(JSON.parse(parked[0].body as string).tags).toEqual(['array(2)', 'string(15)']);
  });

  /**
   * Valid JSON need not be an object. A bare string has no field names, so redaction has nothing
   * to work on and the value would be copied into the dead-letter topic as-is (PR #129 review).
   */
  it.each([
    ['a bare string', JSON.stringify('Bearer must-not-appear')],
    ['an array of strings', JSON.stringify(['Bearer must-not-appear'])],
    ['a number', JSON.stringify(42)],
  ])('parks no body for %s', async (_why, payload) => {
    await consumer.deliver(payload);
    // The body is what gets published; `message` is the fixture's record of what arrived.
    expect(parked[0].body).toBeNull();
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
    // Driven through handle() rather than through the consumer: this configuration no longer
    // consumes at all (see 'starting up'), and reject() still has to log rather than throw for
    // the callers that remain - this spec, and whatever wires handle() up next.
    const alone = new IngestService(lines as unknown as LinesService, consumer);
    await alone.handle({ value: 'not json', topic: 'logging.lines', partition: 0, offset: '7' });
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
  /**
   * A schema-valid line can still hold a credential in a field no name filter knows - `note:
   * "Bearer ..."` - and a line the store refused is not stored anywhere, so the dead-letter topic
   * would be the only place those values lived (PR #129 review).
   */
  it('parks a shape, not values, when the store rejects a valid line', async () => {
    lines.insert.mockRejectedValue(Object.assign(new Error('rejected'), { code: '22001' }));
    await consumer.deliver(line({ note: 'Bearer eyJhbGciOiJSUzI1NiJ9.must-not-appear' }));
    expect(parked[0].body).not.toContain('must-not-appear');
    expect(parked[0].body).toContain('note');
    expect(parked[0].reason).toContain('SQLSTATE 22001');
  });

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
