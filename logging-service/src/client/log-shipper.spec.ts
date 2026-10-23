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
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Added the compound-name and unserialisable-value cases (third review round, PR #129).
 * Author review: Cole Lin, read and approved.
 */
import { LinePublisher, LogShipper, OutboundLine } from './log-shipper';

// AI-generated (reviewed by Cole Lin).

const written: string[] = [];
const published: OutboundLine[] = [];
let ids = 0;

function shipper(publisher?: LinePublisher, maxBuffer = 1000) {
  return new LogShipper({
    service: 'supplier',
    publisher,
    maxBuffer,
    write: (line) => written.push(line),
    newId: () => `id-${(ids += 1)}`,
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
      lineId: 'id-1',
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

  it('still records the envelope when the body could not be built', () => {
    const hostile = new Proxy({}, { ownKeys() { throw new Error('nope'); } });
    shipper().emit({ level: 'warn', event: 'access_denied', hostile });
    const line = JSON.parse(written[0]);
    expect(line).toMatchObject({ service: 'supplier', event: 'line_unserialisable', originalEvent: 'access_denied' });
    expect(line.lineId).toBe('id-1');
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
    expect(JSON.parse(published[0].value).lineId).toBe('id-1');
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
