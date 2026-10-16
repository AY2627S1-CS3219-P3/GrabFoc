/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated these unit tests for the shipper: the envelope, the shared line id, stdout
 *        always, and that a full buffer or a dead publisher drops rather than blocking.
 * Author review: pending — Cole Lin to record what he checked.
 */
import { LinePublisher, LogShipper } from './log-shipper';

const written: string[] = [];
const published: string[] = [];
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

const collecting: LinePublisher = { publish: async (payloads) => void published.push(...payloads) };
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

  it('keeps event-specific fields', () => {
    shipper().emit({ level: 'info', event: 'order_created', orderId: 17 });
    expect(JSON.parse(written[0]).orderId).toBe(17);
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
    expect(published).toEqual(written);
    expect(JSON.parse(published[0]).lineId).toBe('id-1');
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

  it('flushes what is left when the service shuts down', async () => {
    const log = shipper(collecting);
    log.emit({ level: 'info', event: 'one' });
    await log.stop();
    expect(published).toHaveLength(1);
  });
});
