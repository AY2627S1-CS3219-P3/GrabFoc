/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated these unit tests for the shipper: the envelope, the shared line id, stdout
 *        always, and that a full buffer or a dead publisher drops rather than blocking.
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Updated for the requestId message key (Kafka rule 5) and added its cases.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Added the query-string cases after the SoCLaaS review of PR #90.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Added the redaction, envelope-override and shutdown cases after the reviews of
 *        PR #129.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Added the depth-limit, toJSON and synchronous-throw cases after the PR #130
 *        reviews.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-23
 * Scope: Added the throwing-getter and Proxy cases (PR #129 review).
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-23
 * Scope: Added the TOP-LEVEL hostile cases, which the earlier ones missed, and the check that an
 *        exception's message never reaches a line.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Added the compound-name and unserialisable-value cases (third review round, PR #129).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-28
 * Scope: Added the store-bound cases, checked against inboundLineSchema itself, after the eighth
 *        review round on PR #129 found a 500-character path keeping a line out of the store.
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-28
 * Scope: Added the cases for a local write that throws (PR #129 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-28
 * Scope: Added the cases for the fallback line keeping the requestId it failed on
 *        (PR #129 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-28
 * Scope: Added the cases for a throwing newId, an unschedulable flushMs and a service name
 *        mutated after construction (PR #129 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-28
 * Scope: Added the cases for what JSONB cannot hold, and for an Array subclass surviving the
 *        redaction walk (PR #129 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-28
 * Scope: The shared helper mints real UUIDs, because the store requires one of `lineId` and the
 *        shipper no longer passes a non-UUID through. Added the cases for reading the options
 *        once (PR #129 review).
 * Author review: Cole Lin, read and approved.
 */
import { inboundLineSchema } from '../lines/line.schema';
import { LinePublisher, LogShipper, OutboundLine } from './log-shipper';

// AI-generated (reviewed by Cole Lin).

const written: string[] = [];
const published: OutboundLine[] = [];
let ids = 0;
/**
 * Predictable *and* well-formed. The store requires `lineId` to be a UUID, and a `newId` that
 * returns anything else now falls back to a random one - so `id-1` would have made these
 * assertions unpredictable, which is the opposite of what this seam is for (PR #129 review).
 */
const testId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function shipper(publisher?: LinePublisher, maxBuffer = 1000, limits: { maxBufferBytes?: number; maxLineBytes?: number } = {}) {
  return new LogShipper({
    service: 'supplier',
    publisher,
    maxBuffer,
    ...limits,
    write: (line) => written.push(line),
    newId: () => testId((ids += 1)),
  });
}

const collecting: LinePublisher = { publish: async (lines) => void published.push(...lines) };
const neverSettles: LinePublisher = { publish: () => new Promise(() => undefined) };

beforeEach(() => {
  written.length = 0;
  published.length = 0;
  ids = 0;
});

describe('the envelope', () => {
  it('adds lineId, ts and service to what the caller passed', () => {
    shipper().emit({ level: 'warn', event: 'access_denied', status: 403 });
    const line = JSON.parse(written[0]);
    expect(line).toMatchObject({
      lineId: testId(1),
      service: 'supplier',
      level: 'warn',
      event: 'access_denied',
      status: 403,
    });
    // ISO-8601 UTC, which is what the store's ts column accepts.
    expect(line.ts.endsWith('Z')).toBe(true);
    expect(new Date(line.ts).toISOString()).toBe(line.ts);
  });

  // The SoCLaaS review of PR #90: enforce this here, not in each copy of the file.
  it.each([
    ['/locations?lat=1.2966&lon=103.7764', '/locations'],
    ['/locations/7?include=all', '/locations/7'],
    ['/locations', '/locations'],
  ])('strips the query string from %s, whatever the caller passed', (given, expected) => {
    shipper().emit({ level: 'warn', event: 'access_denied', path: given });
    const line = JSON.parse(written[0]);
    expect(line.path).toBe(expected);
    expect(written[0]).not.toContain('103.7764');
  });

  it('leaves out path entirely when the event had none', () => {
    shipper().emit({ level: 'info', event: 'service_started' });
    expect('path' in JSON.parse(written[0])).toBe(false);
  });

  it('keeps event-specific fields', () => {
    shipper().emit({ level: 'info', event: 'order_created', orderId: 17 });
    expect(JSON.parse(written[0]).orderId).toBe(17);
  });
});

describe('redaction', () => {
  // The store filters these names too, but only at the top level and only on ingest; stdout has
  // no filter at all. The one place that can stop a secret being written is here.
  it.each(['password', 'token', 'authorization', 'X-Service-Key', 'otp_hash', 'email'])(
    'never writes a field called %s',
    (field) => {
      shipper().emit({ level: 'warn', event: 'access_denied', [field]: 'must-not-appear' });
      expect(written[0]).not.toContain('must-not-appear');
      expect(written[0]).toContain('[REDACTED]');
    },
  );

  it('redacts a nested secret, not just a top-level one', () => {
    shipper().emit({
      level: 'error',
      event: 'upstream_failed',
      request: { headers: { authorization: 'Bearer must-not-appear' }, retries: 2 },
    });
    expect(written[0]).not.toContain('must-not-appear');
    expect(JSON.parse(written[0]).request.retries).toBe(2);
  });

  it('redacts inside an array', () => {
    shipper().emit({ level: 'warn', event: 'batch_failed', items: [{ token: 'must-not-appear' }] });
    expect(written[0]).not.toContain('must-not-appear');
  });
});

describe('redaction cannot be worked around', () => {
  /** Nests `leaf` `depth` levels down. */
  function deep(depth: number, leaf: unknown): unknown {
    return depth === 0 ? leaf : { next: deep(depth - 1, leaf) };
  }

  // Returning the subtree beyond the limit served a secret nested deeper than six levels verbatim.
  it('truncates past the depth limit instead of serialising what is down there', () => {
    shipper().emit({ level: 'warn', event: 'deep', nested: deep(9, { token: 'must-not-appear' }) });
    expect(written[0]).not.toContain('must-not-appear');
    expect(written[0]).toContain('[TRUNCATED]');
  });

  // A cycle used to reach JSON.stringify, which throws - crashing a caller over a log line.
  it('survives a cyclic object', () => {
    const cyclic: Record<string, unknown> = { name: 'loop' };
    cyclic.self = cyclic;
    const log = shipper();
    expect(() => log.emit({ level: 'warn', event: 'cycle', cyclic })).not.toThrow();
    expect(written).toHaveLength(1);
  });

  // JSON.stringify calls an own toJSON instead of reading the object, so copying one across would
  // let it return anything it liked, unredacted.
  it('ignores a toJSON hook on a nested field', () => {
    shipper().emit({
      level: 'warn',
      event: 'hooked',
      payload: { toJSON: () => ({ token: 'must-not-appear' }), safe: 1 },
    });
    expect(written[0]).not.toContain('must-not-appear');
    expect(JSON.parse(written[0]).payload.safe).toBe(1);
  });

  it('keeps a Date readable', () => {
    shipper().emit({ level: 'info', event: 'dated', when: new Date('2026-10-21T00:00:00.000Z') });
    expect(JSON.parse(written[0]).when).toBe('2026-10-21T00:00:00.000Z');
  });

  // A Date is converted to a string during redaction, so nothing of the caller's runs later.
  it('ignores a toJSON set on a Date itself', () => {
    const when = new Date('2026-10-21T00:00:00.000Z');
    (when as unknown as { toJSON: () => unknown }).toJSON = () => ({ token: 'must-not-appear' });
    shipper().emit({ level: 'info', event: 'dated', when });
    expect(written[0]).not.toContain('must-not-appear');
    expect(JSON.parse(written[0]).when).toBe('2026-10-21T00:00:00.000Z');
  });

  // TypeScript refuses an overridden toJSON in typed code, so this is the path it could take:
  // a subclass whose prototype is patched at runtime, or anything arriving through `any`.
  // toISOString itself was still a virtual call, so an override ran after redaction.
  /**
   * A count is not a bound. A thousand lines carrying a megabyte of metadata each is a gigabyte
   * held by the one component whose job is not to disrupt the service it logs for (PR #129 review).
   */
  it('never buffers a line too large to ship, but still writes it to stdout', () => {
    const log = shipper(neverSettles, 1000, { maxLineBytes: 200 });
    log.emit({ level: 'info', event: 'big', blob: 'x'.repeat(500) });
    expect(written).toHaveLength(1);
    expect(log.counts).toMatchObject({ emitted: 1, oversize: 1, dropped: 0 });
  });

  it('stops buffering once the byte budget is spent, not only the line count', () => {
    const log = shipper(neverSettles, 1000, { maxBufferBytes: 900, maxLineBytes: 400 });
    for (let i = 0; i < 6; i += 1) log.emit({ level: 'info', event: 'e', blob: 'x'.repeat(200) });
    // Every line is on stdout; the buffer stopped well short of the 1,000-line limit.
    expect(written).toHaveLength(6);
    expect(log.counts.dropped).toBeGreaterThan(0);
    expect(log.counts.emitted).toBe(6);
  });

  it('frees the byte budget once a batch has left the buffer', async () => {
    // Three lines fit; six do not, so this fails unless the budget is released on flush. The
    // budget is 1100 rather than 1000 because `lineId` is now a real UUID: a line here is 339
    // bytes, so three are 1017 and six are 2034. Raised deliberately to keep that property rather
    // than to make the test pass - change it again if a field is added to the envelope.
    const log = shipper(collecting, 1000, { maxBufferBytes: 1100, maxLineBytes: 400 });
    for (let i = 0; i < 3; i += 1) log.emit({ level: 'info', event: 'e', blob: 'x'.repeat(200) });
    await log.flush();
    for (let i = 0; i < 3; i += 1) log.emit({ level: 'info', event: 'e', blob: 'x'.repeat(200) });
    await log.flush();
    expect(published).toHaveLength(6);
    expect(log.counts).toMatchObject({ dropped: 0, oversize: 0 });
  });

  /**
   * Only values were ever redacted, so data used as a key shipped untouched (PR #129 review).
   */
  it('replaces a field name that is really data, and keeps the value', () => {
    shipper().emit({ level: 'info', event: 'mail', recipients: { 'alice@nus.edu.sg': true } });
    expect(written[0]).not.toContain('alice@nus.edu.sg');
    expect(JSON.parse(written[0]).recipients).toEqual({
      [`[key 0: ${'alice@nus.edu.sg'.length} chars]`]: true,
    });
  });

  /**
   * A field named `__proto__` used to disappear. `out['__proto__'] = item` runs
   * Object.prototype's setter instead of defining a property, so that one field was dropped while
   * every neighbour survived - silently, from a line that is kept for audit (PR #129 review).
   */
  it.each([
    ['nested in a field', '{"wrapper":{"__proto__":"kept","keep":1}}'],
    ['at the top level', '{"wrapper":{"keep":1},"__proto__":"kept"}'],
  ])('keeps the value of a field named __proto__ %s', (_where, json) => {
    // Through JSON.parse: writing `__proto__` in a literal sets the prototype instead of a field,
    // which is the very behaviour under test.
    shipper().emit({ level: 'info', event: 'odd', ...JSON.parse(json) });
    expect(written[0]).toContain('kept');
    expect(JSON.parse(written[0]).wrapper.keep).toBe(1);
  });

  it('keeps the field names a caller would actually write', () => {
    shipper().emit({ level: 'info', event: 'e', orderId: 17, 'req.path': '/x', 'x-source': 'k' });
    const line = JSON.parse(written[0]);
    expect(line.orderId).toBe(17);
    expect(line['req.path']).toBe('/x');
    expect(line['x-source']).toBe('k');
  });

  it('ignores a toISOString override on a Date', () => {
    const when = new Date('2026-10-25T00:00:00.000Z');
    (when as unknown as { toISOString: () => string }).toISOString = () => 'token must-not-appear';
    shipper().emit({ level: 'info', event: 'dated', when });
    expect(written[0]).not.toContain('must-not-appear');
    expect(JSON.parse(written[0]).when).toBe('2026-10-25T00:00:00.000Z');
  });

  it('ignores a toJSON inherited from a Date subclass', () => {
    const Sneaky = class extends Date {};
    (Sneaky.prototype as unknown as { toJSON: () => unknown }).toJSON = () => ({ token: 'must-not-appear' });
    shipper().emit({ level: 'info', event: 'dated', when: new Sneaky('2026-10-21T00:00:00.000Z') });
    expect(written[0]).not.toContain('must-not-appear');
  });
});

describe('compound sensitive names', () => {
  // An exact-name check missed all of these, which are the names people actually write.
  it.each(['adminToken', 'passwordResetToken', 'apiSecret', 'customerEmail', 'userEmailAddress'])(
    'redacts a field called %s',
    (field) => {
      shipper().emit({ level: 'warn', event: 'denied', [field]: 'must-not-appear' });
      expect(written[0]).not.toContain('must-not-appear');
    },
  );

  // Personal data rather than credentials: the list covered only the latter, so a display name
  // reached stdout, Kafka and the store in the clear (PR #129 review).
  it.each(['displayName', 'display_name', 'fullName', 'firstName', 'lastName', 'phone', 'phoneNumber'])(
    'redacts the personal field %s',
    (field) => {
      shipper().emit({ level: 'info', event: 'profile', [field]: 'must-not-appear' });
      expect(written[0]).not.toContain('must-not-appear');
    },
  );

  it('still writes fields that are not sensitive', () => {
    shipper().emit({ level: 'info', event: 'ok', orderId: 17, building: 'COM3' });
    expect(JSON.parse(written[0])).toMatchObject({ orderId: 17, building: 'COM3' });
  });
});

describe('a value JSON cannot serialise', () => {
  // A bigint makes JSON.stringify throw, which would replace the operation being logged with a
  // TypeError. emit() must never throw.
  it('turns a bigint into text instead of throwing', () => {
    const log = shipper();
    expect(() => log.emit({ level: 'info', event: 'counted', total: 9007199254740993n })).not.toThrow();
    expect(JSON.parse(written[0]).total).toBe('9007199254740993');
  });

  it.each([
    ['a symbol', Symbol('x')],
    ['Infinity', Infinity],
    ['NaN', NaN],
  ])('writes %s as text rather than failing', (_why, value) => {
    const log = shipper();
    expect(() => log.emit({ level: 'info', event: 'odd', value })).not.toThrow();
    expect(written).toHaveLength(1);
  });
});

describe('metadata that fights back', () => {
  // Object.entries runs the getter, and that happens during redaction - before serialisation -
  // so the guard has to cover the whole payload build, not just JSON.stringify (PR #129 review).
  it('does not let a throwing getter escape emit', () => {
    const hostile: Record<string, unknown> = {};
    Object.defineProperty(hostile, 'boom', {
      enumerable: true,
      get() {
        throw new Error('getter exploded');
      },
    });
    const log = shipper();
    expect(() => log.emit({ level: 'warn', event: 'hostile', hostile })).not.toThrow();
    expect(written).toHaveLength(1);
  });

  it('does not let a hostile Proxy escape emit', () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('trap exploded');
        },
      },
    );
    const log = shipper();
    expect(() => log.emit({ level: 'warn', event: 'proxied', hostile })).not.toThrow();
    expect(written).toHaveLength(1);
  });

  /**
   * The earlier cases put the hostile object in a *field value*, so `redactFields` hit it inside
   * the guard. Destructuring `input` itself runs a top-level getter before any of that, which is
   * the hole the PR #145 review found - and these tests had not covered it.
   */
  it('does not let a throwing getter on the input itself escape emit', () => {
    const input: Record<string, unknown> = { level: 'warn', event: 'hostile' };
    Object.defineProperty(input, 'boom', {
      enumerable: true,
      get() {
        throw new Error('getter exploded');
      },
    });
    const log = shipper();
    expect(() => log.emit(input as never)).not.toThrow();
    expect(written).toHaveLength(1);
    expect(JSON.parse(written[0])).toMatchObject({ event: 'line_unserialisable', originalEvent: 'hostile' });
  });

  it('does not let a hostile Proxy input escape emit', () => {
    const input = new Proxy(
      { level: 'warn', event: 'proxied' },
      {
        ownKeys() {
          throw new Error('trap exploded');
        },
      },
    );
    const log = shipper();
    expect(() => log.emit(input as never)).not.toThrow();
    expect(written).toHaveLength(1);
  });

  // The exception came from the caller's own code, so its message is caller-controlled text.
  it('never puts the exception message in the line', () => {
    const input: Record<string, unknown> = { level: 'warn', event: 'hostile' };
    Object.defineProperty(input, 'boom', {
      enumerable: true,
      get() {
        throw new Error('password=hunter2');
      },
    });
    shipper().emit(input as never);
    expect(written[0]).not.toContain('hunter2');
    expect(JSON.parse(written[0]).reason).toBe('the line could not be built');
  });

  it('keys the fallback by the requestId it failed on', async () => {
    const input: Record<string, unknown> = { level: 'warn', event: 'hostile', requestId: 'trace-9' };
    Object.defineProperty(input, 'boom', { enumerable: true, get() { throw new Error('nope'); } });
    const log = shipper(collecting);
    log.emit(input as never);
    await log.flush();
    expect(published[0].key).toBe('trace-9');
  });

  it('still records the envelope when the body could not be built', () => {
    const hostile = new Proxy({}, { ownKeys() { throw new Error('nope'); } });
    shipper().emit({ level: 'warn', event: 'access_denied', hostile });
    const line = JSON.parse(written[0]);
    expect(line).toMatchObject({ service: 'supplier', event: 'line_unserialisable', originalEvent: 'access_denied' });
    expect(line.lineId).toBe(testId(1));
  });
});

describe('the envelope cannot be overwritten', () => {
  // A line claiming another service's name, or its own timestamp, would make the store unreadable.
  it.each([
    ['service', 'gateway'],
    ['ts', '1999-01-01T00:00:00.000Z'],
    ['lineId', 'not-a-uuid'],
  ])('ignores a caller-supplied %s', (field, value) => {
    shipper().emit({ level: 'warn', event: 'access_denied', [field]: value });
    const line = JSON.parse(written[0]);
    expect(line[field]).not.toBe(value);
  });

  it('keeps the envelope this service is responsible for', () => {
    shipper().emit({ level: 'warn', event: 'access_denied', service: 'gateway' });
    expect(JSON.parse(written[0])).toMatchObject({ service: 'supplier', level: 'warn', event: 'access_denied' });
  });
});

describe('without a broker', () => {
  it('still writes every line to stdout', () => {
    const log = shipper();
    log.emit({ level: 'info', event: 'one' });
    log.emit({ level: 'info', event: 'two' });
    expect(written).toHaveLength(2);
    expect(log.counts).toMatchObject({ emitted: 2, dropped: 0, failed: 0 });
  });
});

describe('with a broker', () => {
  it('writes to stdout and publishes the same line, with the same id', async () => {
    const log = shipper(collecting);
    log.emit({ level: 'warn', event: 'access_denied' });
    await log.flush();
    expect(published.map((line) => line.value)).toEqual(written);
    expect(JSON.parse(published[0].value).lineId).toBe(testId(1));
  });

  it('returns before anything is published, so a request never waits on the broker', () => {
    const log = shipper(neverSettles);
    log.emit({ level: 'info', event: 'one' });
    expect(written).toHaveLength(1);
    expect(published).toHaveLength(0);
  });

  it('drops lines rather than growing without limit when the buffer is full', () => {
    const log = shipper(neverSettles, 2);
    for (let i = 0; i < 5; i += 1) log.emit({ level: 'info', event: `e${i}` });
    // Every line still reached stdout; only the Kafka copies were dropped.
    expect(written).toHaveLength(5);
    expect(log.counts).toMatchObject({ emitted: 5, dropped: 3 });
  });

  it('counts a failed publish instead of throwing at the caller', async () => {
    const log = shipper({
      publish: async () => {
        throw new Error('broker down');
      },
    });
    log.emit({ level: 'info', event: 'one' });
    await expect(log.flush()).resolves.toBeUndefined();
    expect(log.counts.failed).toBe(1);
    expect(written).toHaveLength(1);
  });

  // Kafka keeps order only per key, so one request's lines must share one (root AGENTS.md rule 5).
  it('keys each line by its requestId', async () => {
    const log = shipper(collecting);
    log.emit({ level: 'info', event: 'request_started', requestId: 'trace-1' });
    log.emit({ level: 'warn', event: 'access_denied', requestId: 'trace-1' });
    await log.flush();
    expect(published.map((line) => line.key)).toEqual(['trace-1', 'trace-1']);
  });

  it('leaves a line with no request unkeyed, since it has no sequence to keep', async () => {
    const log = shipper(collecting);
    log.emit({ level: 'info', event: 'service_started' });
    await log.flush();
    expect(published[0].key).toBeUndefined();
  });

  /**
   * A publisher that threw synchronously used to leave a settled promise in the guard, so every
   * later flush() returned it and nothing was ever published again (PR #130 review).
   */
  it('keeps shipping after a publisher throws synchronously', async () => {
    let fail = true;
    const log = shipper({
      publish: (lines) => {
        if (fail) throw new Error('no connection');
        published.push(...lines);
        return Promise.resolve();
      },
    });

    log.emit({ level: 'info', event: 'first' });
    await log.flush();
    expect(log.counts.failed).toBe(1);

    fail = false;
    log.emit({ level: 'info', event: 'second' });
    await log.flush();
    expect(published.map((line) => JSON.parse(line.value).event)).toEqual(['second']);
  });

  it('flushes what is left when the service shuts down', async () => {
    const log = shipper(collecting);
    log.emit({ level: 'info', event: 'one' });
    await log.stop();
    expect(published).toHaveLength(1);
  });

  /**
   * flush() used to return early while a publish was in flight, so stop() could return before the
   * lines it was meant to drain had gone anywhere (PR #129 review).
   */
  it('waits for a publish already in flight, and for what was buffered during it', async () => {
    const releases: Array<() => void> = [];
    const slow: LinePublisher = {
      publish: (lines) =>
        new Promise((resolve) => {
          published.push(...lines);
          releases.push(resolve);
        }),
    };
    const log = shipper(slow);
    log.emit({ level: 'info', event: 'first' });
    const inFlight = log.flush();
    log.emit({ level: 'info', event: 'second' });

    const stopped = log.stop();
    let finished = false;
    void stopped.then(() => (finished = true));
    await Promise.resolve();
    expect(finished).toBe(false);

    // Release the publish that was in flight, then the one stop() started for the buffered line.
    releases.shift()!();
    await inFlight;
    await Promise.resolve();
    releases.forEach((resolve) => resolve());
    await stopped;
    expect(published.map((line) => JSON.parse(line.value).event)).toEqual(['first', 'second']);
  });
});

describe('fields the store would refuse', () => {
  // The pairing this shipper has to hold up: a line it writes must be a line the store accepts.
  // Asserted against inboundLineSchema itself rather than against a copy of its numbers, so a
  // bound added there and forgotten here fails a test instead of silently costing lines in
  // production. Only the spec imports it - the shipper is copied into every service and must stay
  // free of logging-service imports.
  const storable = (line: string) => inboundLineSchema.safeParse(JSON.parse(line));

  it.each<[string, unknown]>([
    ['path', `/locations/${'a'.repeat(500)}`],
    ['event', 'e'.repeat(100)],
    ['requestId', 'r'.repeat(300)],
    ['userId', 'u'.repeat(150)],
    ['method', 'NOTAREALMETHOD'],
    ['method', ''],
    ['role', 'guest'],
    ['status', 99],
    ['status', 1000],
    ['status', 200.5],
    ['durationMs', -1],
    ['durationMs', 2147483648],
    ['durationMs', 1.5],
    ['requestId', 42],
  ])('ships a line the store accepts when %s is %p', (field, value) => {
    shipper().emit({ level: 'warn', event: 'access_denied', [field]: value });
    expect(storable(written[0]).success).toBe(true);
  });

  it.each([9, 10, 0x7f])('leaves out a requestId holding control character %i', (code) => {
    // The store refuses these in requestId, userId, service and event, because a line-oriented
    // reader breaks on them. Stripped or dropped here, so one stray tab in a header cannot cost
    // the whole line.
    shipper().emit({ level: 'warn', event: 'access_denied', requestId: `trace${String.fromCharCode(code)}1` });
    expect('requestId' in JSON.parse(written[0])).toBe(false);
    expect(storable(written[0]).success).toBe(true);
  });

  it('keeps the start of an over-long path, marked, rather than losing the line', () => {
    // The finding this came from: `inboundLineSchema` caps `path` at 400, so a 500-character URL
    // left the required access_denied line on the producer's stdout and kept it out of the
    // searchable store - which is the one place anyone looking for it would look (PR #129 review).
    shipper().emit({ level: 'warn', event: 'access_denied', path: `/locations/${'a'.repeat(500)}` });
    const line = JSON.parse(written[0]);
    expect(line.path).toHaveLength(400);
    expect(line.path.startsWith('/locations/aaa')).toBe(true);
    expect(line.path.endsWith('[TRUNCATED]')).toBe(true);
  });

  it('cuts an over-long event name rather than dropping a field the store requires', () => {
    shipper().emit({ level: 'warn', event: 'e'.repeat(100) });
    expect(JSON.parse(written[0]).event).toHaveLength(60);
  });

  it.each(['requestId', 'userId'])('leaves out an over-long %s rather than cutting it', (field) => {
    // Cut to length, a 300-character requestId is some other request's id and a userId is some
    // other student's. An absent field is honest; a wrong one reads as fact.
    shipper().emit({ level: 'warn', event: 'access_denied', [field]: 'x'.repeat(300) });
    expect(field in JSON.parse(written[0])).toBe(false);
  });

  it('does not key a message by a requestId the store will not hold', async () => {
    const log = shipper(collecting);
    log.emit({ level: 'info', event: 'access_denied', requestId: 'x'.repeat(300) });
    await log.flush();
    expect(published[0].key).toBeUndefined();
  });

  it('reports a level it does not recognise as an error rather than hiding the line', () => {
    shipper().emit({ level: 'trace' as never, event: 'access_denied' });
    expect(JSON.parse(written[0]).level).toBe('error');
    expect(storable(written[0]).success).toBe(true);
  });

  it('still names an event when the caller passed none', () => {
    shipper().emit({ level: 'info' } as never);
    const line = JSON.parse(written[0]);
    expect(typeof line.event).toBe('string');
    expect(line.event.length).toBeGreaterThan(0);
    expect(storable(written[0]).success).toBe(true);
  });

  it('counts a line it had to clamp, so the producer sending them can be found', () => {
    const log = shipper();
    // Stripping the query string is this shipper's own rule, not the store's bound, so it is not
    // a clamp: counting it would fire on every request line and tell an operator nothing.
    log.emit({ level: 'info', event: 'ok', path: '/x?lat=1' });
    expect(log.counts.clamped).toBe(0);
    log.emit({ level: 'info', event: 'ok', userId: 'u'.repeat(300) });
    expect(log.counts.clamped).toBe(1);
  });

  it('refuses a service name the store would reject, at construction', () => {
    // Not at emit(): a name over the store's 40 characters makes every line this service will
    // ever write unstorable, and the startup that configured it is the only place to say so.
    expect(() => new LogShipper({ service: 's'.repeat(41) })).toThrow(RangeError);
    expect(() => new LogShipper({ service: '' })).toThrow(RangeError);
  });

  it('bounds the event name it echoes back in a line it could not build', () => {
    const hostile = new Proxy({}, { ownKeys() { throw new Error('nope'); } });
    shipper().emit({ level: 'warn', event: 'e'.repeat(500), hostile });
    const line = JSON.parse(written[0]);
    expect(line.event).toBe('line_unserialisable');
    expect(line.originalEvent).toHaveLength(60);
    expect(storable(written[0]).success).toBe(true);
  });
});

describe('a local write that fails', () => {
  // `write` is a documented option, so it is caller-supplied code, and the default `console.log`
  // is not safe either: stdout in a container is a pipe, and on Linux a pipe write is synchronous,
  // so a reader that goes away raises EPIPE straight into whoever called emit(). This write was
  // the one statement outside the guard, so a dead sink took down the request it was logging - the
  // one thing this component exists not to do (PR #129 review).
  const throwing = () => {
    throw new Error('EPIPE');
  };

  it('does not let the exception reach the caller', () => {
    const log = new LogShipper({ service: 'supplier', write: throwing, newId: () => testId(1) });
    expect(() => log.emit({ level: 'warn', event: 'access_denied' })).not.toThrow();
    expect(log.counts).toMatchObject({ emitted: 1, writeFailed: 1 });
  });

  it('still buffers the line for the broker', async () => {
    // A broken stdout is a reason to ship harder, not to stop: the topic is then the only copy.
    const log = new LogShipper({
      service: 'supplier',
      publisher: collecting,
      write: throwing,
      newId: () => testId(1),
    });
    log.emit({ level: 'info', event: 'access_denied', requestId: 'trace-1' });
    await log.flush();
    expect(published.map((out) => JSON.parse(out.value).event)).toEqual(['access_denied']);
  });

  it('keeps working once the sink recovers', () => {
    let broken = true;
    const log = new LogShipper({
      service: 'supplier',
      write: (out) => {
        if (broken) throw new Error('EPIPE');
        written.push(out);
      },
      newId: () => testId(1),
    });
    log.emit({ level: 'info', event: 'first' });
    broken = false;
    log.emit({ level: 'info', event: 'second' });
    expect(written.map((out) => JSON.parse(out).event)).toEqual(['second']);
    expect(log.counts).toMatchObject({ emitted: 2, writeFailed: 1 });
  });
});

describe('the fallback line stays on its request', () => {
  // The fallback is the only record that a log call failed, and it carried no requestId - so in the
  // one service whose purpose is following a request across services, the gap in a trace read as a
  // line nobody wrote rather than a line that was lost (PR #129 review). `input.event` was already
  // read defensively for exactly this reason; `input.requestId` is read the same way.
  const throwingInput = (fields: Record<string, unknown>) => {
    const input: Record<string, unknown> = { level: 'warn', event: 'access_denied', ...fields };
    Object.defineProperty(input, 'boom', {
      enumerable: true,
      get() {
        throw new Error('nope');
      },
    });
    return input;
  };

  it('keeps the requestId on the line', () => {
    shipper().emit(throwingInput({ requestId: 'trace-1' }) as never);
    expect(JSON.parse(written[0])).toMatchObject({
      event: 'line_unserialisable',
      requestId: 'trace-1',
    });
  });

  it('leaves out a requestId the store would refuse, rather than costing the line', () => {
    shipper().emit(throwingInput({ requestId: 'x'.repeat(201) }) as never);
    const line = JSON.parse(written[0]);
    expect(line.event).toBe('line_unserialisable');
    expect(line).not.toHaveProperty('requestId');
  });

  it('still writes a fallback line when reading the requestId itself throws', () => {
    const input: Record<string, unknown> = { level: 'warn', event: 'access_denied' };
    Object.defineProperty(input, 'requestId', {
      enumerable: true,
      get() {
        throw new Error('nope');
      },
    });
    const log = shipper();
    expect(() => log.emit(input as never)).not.toThrow();
    expect(JSON.parse(written[0]).event).toBe('line_unserialisable');
  });

  it('writes a fallback line the store will take', () => {
    const log = shipper();
    log.emit(throwingInput({ requestId: 'trace-1' }) as never);
    expect(inboundLineSchema.safeParse(JSON.parse(written[0])).success).toBe(true);
  });
});

describe('the other caller-supplied parts of the options', () => {
  /**
   * `write` was guarded a round ago; `newId` sat in the same statement, one line above it, and was
   * not. Both are documented options, so both are caller code running on the request's own stack -
   * and this one ran before `build()`, so its exception escaped `emit()` entirely (PR #129 review).
   */
  describe('a newId that throws', () => {
    const throwing = () => {
      throw new Error('no entropy');
    };

    it('does not reach the caller', () => {
      const log = new LogShipper({ service: 'supplier', write: (l) => written.push(l), newId: throwing });
      expect(() => log.emit({ level: 'warn', event: 'access_denied' })).not.toThrow();
    });

    it('still writes the line, with an id the store will take', () => {
      const log = new LogShipper({ service: 'supplier', write: (l) => written.push(l), newId: throwing });
      log.emit({ level: 'warn', event: 'access_denied' });
      // A line with no id is a line the store refuses outright, so the default stands in: losing
      // the line over a broken id generator would be the worse of the two failures.
      expect(inboundLineSchema.safeParse(JSON.parse(written[0])).success).toBe(true);
    });

    it('is counted, so a broken generator is not silent', () => {
      const log = new LogShipper({ service: 'supplier', write: (l) => written.push(l), newId: throwing });
      log.emit({ level: 'warn', event: 'access_denied' });
      expect(log.counts).toMatchObject({ emitted: 1, idFailed: 1 });
    });
  });

  /**
   * setInterval takes a signed 32-bit delay and silently reduces anything else to about 1 ms, so a
   * publisher plus one of these values is a flush loop for the life of the process - from the
   * component whose whole purpose is not to disturb the service it logs for. PurgeService already
   * guards its own timer for the same reason (PR #129 review).
   */
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])(
    'refuses flushMs=%p at construction',
    (flushMs) => {
      expect(() => new LogShipper({ service: 'supplier', publisher: collecting, flushMs })).toThrow(RangeError);
    },
  );

  it.each([1, 1000, 2_147_483_647])('accepts flushMs=%p', (flushMs) => {
    expect(() => new LogShipper({ service: 'supplier', publisher: collecting, flushMs })).not.toThrow();
  });

  /**
   * The name is validated once, in the constructor, and was then reread from the caller's own
   * object on every line - so mutating it afterwards misattributed later lines, or made every one
   * of them unstorable, without passing that check again (PR #129 review).
   */
  it('keeps the service name it validated, even if the caller mutates the options', () => {
    const options = { service: 'supplier', write: (l: string) => written.push(l), newId: () => testId(1) };
    const log = new LogShipper(options);
    options.service = 'gateway';
    log.emit({ level: 'warn', event: 'access_denied' });
    expect(JSON.parse(written[0]).service).toBe('supplier');
  });

  it('keeps it on the fallback line too', () => {
    const options = { service: 'supplier', write: (l: string) => written.push(l), newId: () => testId(1) };
    const log = new LogShipper(options);
    options.service = 'x'.repeat(200);
    const hostile = new Proxy({}, { ownKeys() { throw new Error('nope'); } });
    log.emit({ level: 'warn', event: 'access_denied', hostile });
    const line = JSON.parse(written[0]);
    expect(line).toMatchObject({ event: 'line_unserialisable', service: 'supplier' });
  });
});

describe('values the store cannot hold in extra', () => {
  /**
   * `extra` is JSONB, and PostgreSQL's JSONB cannot represent a NUL or an unpaired surrogate - it
   * refuses the value with a class-22 error, which ingest reads as permanently unstorable and
   * parks. Stripped here as well as there, so stdout and the stored row say the same thing; and
   * stripped rather than rejected, because losing the character costs less than losing the line
   * (PR #129 review).
   */
  it.each([
    ['a NUL', `a${'\u0000'}b`],
    ['an unpaired surrogate', `a${'\ud800'}b`],
  ])('removes %s from a metadata value', (_why, note) => {
    shipper().emit({ level: 'warn', event: 'access_denied', note });
    expect(JSON.parse(written[0]).note).toBe('ab');
  });

  it('writes a line the store will take', () => {
    const log = shipper();
    log.emit({ level: 'warn', event: 'access_denied', note: `a${'\u0000'}b` });
    expect(inboundLineSchema.safeParse(JSON.parse(written[0])).success).toBe(true);
  });

  it('keeps a tab, a newline and a valid surrogate pair', () => {
    shipper().emit({ level: 'warn', event: 'access_denied', note: 'a\tb\nc\ud83d\ude00' });
    expect(JSON.parse(written[0]).note).toBe('a\tb\nc\ud83d\ude00');
  });
});

describe('an Array subclass in the metadata', () => {
  /**
   * `Array.prototype.map` goes through `Symbol.species`, so mapping a subclass returned another
   * instance of it - prototype and all - and `JSON.stringify` then called the inherited `toJSON`
   * *after* redaction had finished, free to return anything at all. Dropping own function values
   * does not help here: a class puts `toJSON` on the prototype, where `Object.entries` never
   * looks. An overridden `map` would have been caller code running in the walk as well
   * (PR #129 review).
   */
  class Sneaky extends Array {
    toJSON() {
      return 'password=hunter2';
    }
  }

  const sneaky = () => {
    const out = new Sneaky();
    out.push('a');
    return out;
  };

  it('does not let an inherited toJSON reach the line', () => {
    shipper().emit({ level: 'warn', event: 'access_denied', items: sneaky() });
    expect(written[0]).not.toContain('hunter2');
  });

  it('ships it as a plain array', () => {
    shipper().emit({ level: 'warn', event: 'access_denied', items: sneaky() });
    expect(JSON.parse(written[0]).items).toEqual(['a']);
  });

  it('does not call a map the caller overrode', () => {
    class Trap extends Array {
      map(): never[] {
        throw new Error('map exploded');
      }
    }
    const items = new Trap();
    items.push('a');
    const log = shipper();
    expect(() => log.emit({ level: 'warn', event: 'access_denied', items })).not.toThrow();
    // Not the fallback line: the walk never went through the caller's `map` at all.
    expect(JSON.parse(written[0])).toMatchObject({ event: 'access_denied', items: ['a'] });
  });
});

describe('an id the store would refuse', () => {
  /**
   * `lineId` is the one envelope field that cannot be dropped or cut: the store requires a UUID,
   * so a `newId` returning anything else costs every line that service writes. `service` is checked
   * at construction for exactly that reason; this one is per line, so it is checked per line
   * (PR #129 review).
   */
  it('falls back to a real one rather than shipping it', () => {
    const log = new LogShipper({ service: 'supplier', write: (l) => written.push(l), newId: () => 'id-1' });
    log.emit({ level: 'warn', event: 'access_denied' });
    const line = JSON.parse(written[0]);
    expect(line.lineId).not.toBe('id-1');
    expect(inboundLineSchema.safeParse(line).success).toBe(true);
  });

  it.each([['an empty string', ''], ['a number', 7], ['undefined', undefined]])(
    'falls back when newId returns %s',
    (_why, value) => {
      const log = new LogShipper({
        service: 'supplier',
        write: (l) => written.push(l),
        newId: () => value as string,
      });
      log.emit({ level: 'warn', event: 'access_denied' });
      expect(inboundLineSchema.safeParse(JSON.parse(written[0])).success).toBe(true);
    },
  );

  it('counts it alongside a generator that throws', () => {
    const log = new LogShipper({ service: 'supplier', write: (l) => written.push(l), newId: () => 'id-1' });
    log.emit({ level: 'warn', event: 'access_denied' });
    expect(log.counts).toMatchObject({ emitted: 1, idFailed: 1 });
  });
});

describe('the options are read once, at construction', () => {
  /**
   * Guarding the *call* to `newId` was not enough: reading `this.options.newId` is itself a
   * property access on an object the caller still owns, and it happened before the guard - so an
   * accessor or a Proxy trap that throws escaped `emit()` anyway. Same for `publisher`, read
   * outside any guard in `emit()`. Every option is held in a field now, so after construction
   * there is nothing of the caller's left to read (PR #129 review).
   */
  it('does not read the caller\'s object again after construction', () => {
    const reads: string[] = [];
    const options = new Proxy(
      { service: 'supplier', write: (l: string) => written.push(l), newId: () => testId(1) },
      {
        get(target, key, receiver) {
          reads.push(String(key));
          return Reflect.get(target, key, receiver);
        },
      },
    );
    const log = new LogShipper(options);
    reads.length = 0;
    log.emit({ level: 'warn', event: 'access_denied' });
    log.emit({ level: 'warn', event: 'access_denied' });
    expect(reads).toEqual([]);
    expect(written).toHaveLength(2);
  });

  it.each(['newId', 'write', 'publisher'])('surfaces a throwing %s getter at construction', (option) => {
    const options = {
      service: 'supplier',
      get [option]() {
        throw new Error('getter exploded');
      },
    };
    // A constructor may throw where emit() may not: this is a configuration error, raised at the
    // line that made it rather than inside the first request that happens to log.
    expect(() => new LogShipper(options as never)).toThrow('getter exploded');
  });
});
