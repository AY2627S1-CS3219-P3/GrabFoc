/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
 * Scope: Generated these integration tests for the SupplierDeactivated outbox and its relay,
 *        against a real PostgreSQL with a fake publisher (issue #120).
 * Author review: pending — Jie Yang to record what he checked.
 */
import { Pool } from 'pg';
import { ProblemException } from '../common/problem';
import { LocationsService } from '../locations/locations.service';
import { emptyLocations, openTestDatabase } from '../test/database';
import { OutboxRelay } from './outbox.relay';
import { OutboundMessage, Publisher } from './publisher';

/** Records what was sent; `failNext` makes the next send fail, as if Kafka were down. */
class FakePublisher implements Publisher {
  sent: OutboundMessage[] = [];
  failNext = false;

  async send(message: OutboundMessage): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('Kafka is unavailable');
    }
    this.sent.push(message);
  }
}

let pool: Pool;
let service: LocationsService;
let publisher: FakePublisher;
let relay: OutboxRelay;

beforeAll(async () => {
  pool = await openTestDatabase();
  service = new LocationsService(pool);
});
afterAll(() => pool.end());
beforeEach(async () => {
  await emptyLocations(pool);
  publisher = new FakePublisher();
  relay = new OutboxRelay(pool, publisher);
});

async function insertLocation(status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE'): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO locations (name, type, building, floor, location_desc, lat, lon, status)
     VALUES ('Techno Edge Canteen', 'Food', 'Techno Edge', 1, 'desc', 1.3, 103.8, $1) RETURNING id`,
    [status],
  );
  return rows[0].id;
}

async function outboxCount(): Promise<number> {
  const { rows } = await pool.query<{ n: string }>('SELECT count(*) AS n FROM supplier_outbox');
  return Number(rows[0].n);
}

async function statusOf(action: () => Promise<unknown>): Promise<number> {
  try {
    await action();
  } catch (err) {
    if (err instanceof ProblemException) return err.getStatus();
    throw err;
  }
  throw new Error('expected the call to fail');
}

it('a deactivation publishes exactly one SupplierDeactivated, keyed by the location id', async () => {
  const id = await insertLocation();
  await service.setStatus(id, 'INACTIVE');

  expect(await relay.publishPending()).toBe(1);
  expect(publisher.sent).toHaveLength(1);
  const [message] = publisher.sent;
  expect(message.topic).toBe('supplier.events');
  expect(message.key).toBe(String(id));
  expect(JSON.parse(message.value)).toEqual({
    eventId: expect.any(String),
    eventType: 'SupplierDeactivated',
    occurredAt: expect.any(String),
    data: { locationId: id },
  });

  // Already sent, so a second pass sends nothing.
  expect(await relay.publishPending()).toBe(0);
  expect(publisher.sent).toHaveLength(1);
});

it('a deactivation of an unknown location (404) publishes nothing', async () => {
  expect(await statusOf(() => service.setStatus(999, 'INACTIVE'))).toBe(404);
  expect(await outboxCount()).toBe(0);
});

it('a deactivation of an INACTIVE location (409) publishes nothing', async () => {
  const id = await insertLocation('INACTIVE');
  expect(await statusOf(() => service.setStatus(id, 'INACTIVE'))).toBe(409);
  expect(await outboxCount()).toBe(0);
});

it('a restore publishes nothing', async () => {
  const id = await insertLocation('INACTIVE');
  await service.setStatus(id, 'ACTIVE');
  expect(await outboxCount()).toBe(0);
});

it('an event saved while Kafka is down is sent once Kafka is back', async () => {
  const id = await insertLocation();
  await service.setStatus(id, 'INACTIVE');

  publisher.failNext = true;
  expect(await relay.publishPending()).toBe(0);
  const { rows } = await pool.query('SELECT published_at FROM supplier_outbox');
  expect(rows).toEqual([{ published_at: null }]);

  expect(await relay.publishPending()).toBe(1);
  expect(publisher.sent.map((m) => m.key)).toEqual([String(id)]);
});

it('a failed send holds back later events, so they are never reordered', async () => {
  const first = await insertLocation();
  await service.setStatus(first, 'INACTIVE');
  await service.setStatus(first, 'ACTIVE');
  await service.setStatus(first, 'INACTIVE');

  publisher.failNext = true;
  expect(await relay.publishPending()).toBe(0);
  expect(publisher.sent).toHaveLength(0);

  expect(await relay.publishPending()).toBe(2);
  const [a, b] = publisher.sent.map((m) => JSON.parse(m.value));
  expect(Date.parse(a.occurredAt)).toBeLessThanOrEqual(Date.parse(b.occurredAt));
});

it('overlapping passes send each event once', async () => {
  const id = await insertLocation();
  await service.setStatus(id, 'INACTIVE');

  const [x, y] = await Promise.all([relay.publishPending(), relay.publishPending()]);
  expect(x + y).toBeGreaterThanOrEqual(1);
  expect(publisher.sent).toHaveLength(1);
});
