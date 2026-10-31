/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Generated the order event handling tests against PostgreSQL (#150, #152), from the
 *        decisions in #148.
 * Author review: pending — Jie Yang to record the review.
 */
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { SCHEMA_SQL } from '../db/schema';
import { OrderEvent, OrderStatus } from '../messaging/messages';
import { emptyTables, openTestDatabase, testDatabaseUrl } from '../test/database';
import { OrderEventsService } from './order-events.service';

let pool: Pool;
let service: OrderEventsService;

beforeAll(async () => {
  pool = await openTestDatabase();
  service = new OrderEventsService(pool);
});
afterAll(async () => {
  await pool?.end();
});
beforeEach(async () => {
  await emptyTables(pool);
});

const requesterId = randomUUID();
const courierId = randomUUID();

function event(orderId: string, status: OrderStatus, overrides: Partial<OrderEvent> = {}): OrderEvent {
  return {
    eventId: randomUUID(),
    eventType: `Order${status}`,
    occurredAt: new Date(),
    orderId,
    requesterId,
    courierId: status === 'PENDING' ? null : courierId,
    status,
    reason: null,
    ...overrides,
  };
}

async function lastStatus(orderId: string): Promise<string | undefined> {
  const { rows } = await pool.query('SELECT last_status FROM notification_order_states WHERE order_id = $1', [orderId]);
  return rows[0]?.last_status;
}
async function recipients(eventId: string): Promise<{ role: string; recipient_id: string; delivery_status: string }[]> {
  const { rows } = await pool.query(
    'SELECT role, recipient_id, delivery_status FROM notifications WHERE event_id = $1 ORDER BY role',
    [eventId],
  );
  return rows;
}
async function outcomeOf(eventId: string): Promise<string | undefined> {
  const { rows } = await pool.query('SELECT outcome FROM notification_events WHERE event_id = $1', [eventId]);
  return rows[0]?.outcome;
}

it('applies the schema again without error', async () => {
  await expect(pool.query(SCHEMA_SQL)).resolves.toBeDefined();
});

it('queues one notification per recipient', async () => {
  const accepted = event(randomUUID(), 'ACCEPTED');
  expect(await service.handle(accepted)).toBe('QUEUED');
  expect(await recipients(accepted.eventId)).toEqual([
    { role: 'REQUESTER', recipient_id: requesterId, delivery_status: 'PENDING' },
  ]);
  expect(await outcomeOf(accepted.eventId)).toBe('PROCESSING');
});

it('changes nothing for a duplicate event id', async () => {
  const orderId = randomUUID();
  const accepted = event(orderId, 'ACCEPTED');
  await service.handle(accepted);
  expect(await service.handle(accepted)).toBe('DUPLICATE');
  expect(await recipients(accepted.eventId)).toHaveLength(1);
});

it('moves forward through the lifecycle', async () => {
  const orderId = randomUUID();
  for (const status of ['ACCEPTED', 'PICKED_UP', 'IN_PROGRESS', 'ARRIVED', 'COMPLETED'] as const) {
    expect(await service.handle(event(orderId, status))).toBe('QUEUED');
  }
  expect(await lastStatus(orderId)).toBe('COMPLETED');
});

it('discards an event that arrives after a later state', async () => {
  const orderId = randomUUID();
  await service.handle(event(orderId, 'PICKED_UP'));
  const accepted = event(orderId, 'ACCEPTED');
  expect(await service.handle(accepted)).toBe('DISCARDED_STALE');
  expect(await outcomeOf(accepted.eventId)).toBe('DISCARDED_STALE');
  expect(await recipients(accepted.eventId)).toEqual([]);
  expect(await lastStatus(orderId)).toBe('PICKED_UP');
});

it('processes a repeat of the same state under a new event id', async () => {
  const orderId = randomUUID();
  await service.handle(event(orderId, 'ACCEPTED'));
  expect(await service.handle(event(orderId, 'ACCEPTED'))).toBe('QUEUED');
});

it.each([
  ['COMPLETED', 'CANCELLED'],
  ['CANCELLED', 'COMPLETED'],
  ['CANCELLED', 'CANCELLED'],
] as const)('blocks %s → %s: a final state blocks every later event', async (first, second) => {
  const orderId = randomUUID();
  await service.handle(event(orderId, first));
  expect(await service.handle(event(orderId, second))).toBe('DISCARDED_STALE');
  expect(await lastStatus(orderId)).toBe(first);
});

it('emails the requester and courier on COMPLETED', async () => {
  const completed = event(randomUUID(), 'COMPLETED');
  await service.handle(completed);
  expect((await recipients(completed.eventId)).map((r) => r.role)).toEqual(['REQUESTER', 'COURIER']);
});

it('emails only the requester when an order is cancelled before anyone accepts it', async () => {
  const cancelled = event(randomUUID(), 'CANCELLED', { courierId: null, reason: 'REQUESTER_CANCELLED' });
  await service.handle(cancelled);
  expect((await recipients(cancelled.eventId)).map((r) => r.role)).toEqual(['REQUESTER']);
  const { rows } = await pool.query('SELECT reason FROM notification_events WHERE event_id = $1', [cancelled.eventId]);
  expect(rows[0].reason).toBe('REQUESTER_CANCELLED');
});

it('records a PENDING event with nobody to email', async () => {
  const pending = event(randomUUID(), 'PENDING');
  expect(await service.handle(pending)).toBe('DISCARDED_NO_AUDIENCE');
  expect(await outcomeOf(pending.eventId)).toBe('DISCARDED_NO_AUDIENCE');
});

it('leaves no trace when the transaction fails part-way', async () => {
  const orderId = randomUUID();
  const broken = event(orderId, 'ACCEPTED');
  // Its own pool, so the patched connection never goes back to the shared one.
  const failingPool = new Pool({ connectionString: testDatabaseUrl(), max: 1 });
  const connect = failingPool.connect.bind(failingPool) as () => Promise<import('pg').PoolClient>;
  const failing = new OrderEventsService({
    connect: async () => {
      const client = await connect();
      const query = client.query.bind(client);
      // Fail the recipient insert, after the event and state rows were written.
      (client as unknown as { query: unknown }).query = (text: unknown, ...rest: unknown[]) =>
        typeof text === 'string' && text.includes('INSERT INTO notifications')
          ? Promise.reject(new Error('boom'))
          : (query as (...args: unknown[]) => unknown)(text, ...rest);
      return client;
    },
  } as unknown as Pool);
  try {
    await expect(failing.handle(broken)).rejects.toThrow('boom');
  } finally {
    await failingPool.end();
  }
  expect(await outcomeOf(broken.eventId)).toBeUndefined();
  expect(await lastStatus(orderId)).toBeUndefined();
  // The redelivered message is then handled from the start.
  expect(await service.handle(broken)).toBe('QUEUED');
});
