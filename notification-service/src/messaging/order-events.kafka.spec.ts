/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Generated the order.events consumer tests against Kafka and PostgreSQL (#152), following
 *        credit-service/src/messaging/wallets.kafka.spec.ts.
 * Author review: pending — Jie Yang to record the review.
 */
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { config } from '../config';
import { DeadLettersService } from '../dead-letters/dead-letters.service';
import { OrderEventsService } from '../events/order-events.service';
import { emptyTables, openTestDatabase } from '../test/database';
import { createTestTopics, testKafkaBrokers, waitFor } from '../test/kafka';
import { KafkaConnection } from './kafka.connection';
import { KafkaRunner } from './kafka.runner';
import { OrderEvent } from './messages';
import { buildTopics } from './topics';

// Own topics and consumer group, so a running Notification Service never sees these messages.
const prefix = `test-${randomUUID().slice(0, 8)}.`;
const topics = buildTopics(prefix);

/** OrderEventsService whose next `failures` calls fail, as if the database were down. */
class FlakyEvents extends OrderEventsService {
  failures = 0;
  calls = 0;
  override handle(event: OrderEvent) {
    this.calls++;
    if (this.failures > 0) {
      this.failures--;
      return Promise.reject(new Error('connect ECONNREFUSED (database down)'));
    }
    return super.handle(event);
  }
}

let pool: Pool;
let events: FlakyEvents;
let connection: KafkaConnection;
let admin: KafkaJS.Admin;
let deleteTopics: () => Promise<void>;
let runner: KafkaRunner;

beforeAll(async () => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  config.kafkaBrokers = [testKafkaBrokers()];
  config.kafkaGroupId = `notification-test-${prefix}`;
  pool = await openTestDatabase();
  connection = new KafkaConnection();
  admin = connection.kafka.admin();
  await admin.connect();
  deleteTopics = await createTestTopics(admin, topics);
  await connection.onModuleInit();
  events = new FlakyEvents(pool);
  runner = new KafkaRunner(events, new DeadLettersService(pool), connection, topics);
  await runner.onApplicationBootstrap();
});
afterAll(async () => {
  await runner?.onModuleDestroy();
  await connection?.onModuleDestroy();
  await deleteTopics?.();
  await admin?.disconnect();
  await pool?.end();
  jest.restoreAllMocks();
});
beforeEach(async () => {
  events.failures = 0;
  await emptyTables(pool);
});

const send = (key: string, body: unknown) =>
  connection.send({
    topic: topics.orderEvents,
    key,
    value: Buffer.isBuffer(body) ? body : typeof body === 'string' ? body : JSON.stringify(body),
    headers: {},
  });
const orderEvent = (orderId: string, status: string) => ({
  eventId: randomUUID(),
  eventType: 'OrderAccepted',
  occurredAt: new Date().toISOString(),
  data: { orderId, requesterId: randomUUID(), courierId: randomUUID(), status },
});
async function eventRow(eventId: string): Promise<{ outcome: string } | undefined> {
  const { rows } = await pool.query('SELECT outcome FROM notification_events WHERE event_id = $1', [eventId]);
  return rows[0];
}
async function deadLetters(): Promise<{ message_key: string; payload: Buffer; error: string; source_topic: string }[]> {
  return (await pool.query('SELECT message_key, payload, error, source_topic FROM notification_dead_letters ORDER BY id')).rows;
}

it('records an event and queues its notification', async () => {
  const orderId = randomUUID();
  const accepted = orderEvent(orderId, 'ACCEPTED');
  await send(orderId, accepted);
  await waitFor(() => eventRow(accepted.eventId));
  const { rows } = await pool.query('SELECT role FROM notifications WHERE event_id = $1', [accepted.eventId]);
  expect(rows).toEqual([{ role: 'REQUESTER' }]);
});

it('handles a duplicated event once', async () => {
  const orderId = randomUUID();
  const accepted = orderEvent(orderId, 'ACCEPTED');
  await send(orderId, accepted);
  await send(orderId, accepted);
  const marker = orderEvent(orderId, 'PICKED_UP');
  await send(orderId, marker);
  await waitFor(() => eventRow(marker.eventId));
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM notifications WHERE event_id = $1', [accepted.eventId]);
  expect(rows[0].n).toBe(1);
});

it('dead-letters unreadable events into the table without stopping the partition', async () => {
  const orderId = randomUUID();
  const bad = orderEvent(orderId, 'LOST');
  const bytes = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]);
  await send('bad-1', bad);
  await send('bad-2', 'not json');
  await send('bad-3', bytes);
  const good = orderEvent(randomUUID(), 'ACCEPTED');
  await send('good', good);

  await waitFor(() => eventRow(good.eventId));
  const rows = await waitFor(async () => {
    const found = await deadLetters();
    return found.length >= 3 && found;
  });
  expect(rows.map((r) => r.message_key)).toEqual(['bad-1', 'bad-2', 'bad-3']);
  expect(rows[0].error).toMatch(/data\.status/);
  expect(rows[0].source_topic).toBe(topics.orderEvents);
  expect(rows[1].payload.toString()).toBe('not json');
  expect(rows[2].payload).toEqual(bytes);
});

it('reads an event again after the database write failed', async () => {
  events.failures = 1;
  events.calls = 0;
  const orderId = randomUUID();
  const accepted = orderEvent(orderId, 'ACCEPTED');
  const started = Date.now();
  await send(orderId, accepted);

  await waitFor(() => eventRow(accepted.eventId));
  expect(events.calls).toBe(2);
  // The runner rests the partition for 5 s before reading the message again.
  expect(Date.now() - started).toBeGreaterThanOrEqual(4_500);
});

it('refuses to start when its dead-letter topic is missing from Kafka', async () => {
  const other = buildTopics(`test-${randomUUID().slice(0, 8)}.`);
  await admin.createTopics({ timeout: 30_000, topics: [{ topic: other.orderEvents, numPartitions: 1 }] });
  const misconfigured = new KafkaRunner(events, new DeadLettersService(pool), connection, other);
  try {
    await expect(misconfigured.onApplicationBootstrap()).rejects.toThrow(/missing.*order-events\.dlt/);
  } finally {
    await misconfigured.onModuleDestroy();
    await admin.deleteTopics({ topics: [other.orderEvents], timeout: 30_000 });
  }
});
