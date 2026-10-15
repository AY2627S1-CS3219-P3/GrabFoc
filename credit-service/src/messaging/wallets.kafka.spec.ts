/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated end-to-end tests against a real Kafka broker and PostgreSQL for wallets from
 *        UserRegistered and the user-event dead-letter topic (spec §7, §9; K11–K12).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { config } from '../config';
import { CreditsService } from '../credits/credits.service';
import { emptyTables, openTestDatabase } from '../test/database';
import { collect, createTestTopics, testKafkaBrokers, waitFor } from '../test/kafka';
import { KafkaConnection } from './kafka.connection';
import { KafkaRunner } from './kafka.runner';
import { HEADER } from './messages';
import { buildTopics } from './topics';

// Own topics and consumer group, so a running Credit Service never sees these messages.
const prefix = `test-${randomUUID().slice(0, 8)}.`;
const topics = buildTopics([1000], prefix);

let pool: Pool;
let connection: KafkaConnection;
let admin: KafkaJS.Admin;
let deleteTopics: () => Promise<void>;
let runner: KafkaRunner;

beforeAll(async () => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  config.kafkaBrokers = [testKafkaBrokers()];
  config.kafkaGroupId = `credit-test-${prefix}`;
  pool = await openTestDatabase();
  connection = new KafkaConnection();
  admin = connection.kafka.admin();
  await admin.connect();
  deleteTopics = await createTestTopics(admin, topics);
  await connection.onModuleInit();
  runner = new KafkaRunner(new CreditsService(pool), connection, topics);
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
beforeEach(() => emptyTables(pool));

const send = (key: string, body: unknown) =>
  connection.send({
    topic: topics.userEvents,
    key,
    value: typeof body === 'string' ? body : JSON.stringify(body),
    headers: {},
  });
const registered = (userId: string) => ({
  type: 'UserRegistered',
  eventId: randomUUID(),
  userId,
  occurredAt: new Date().toISOString(),
});
async function balanceOf(userId: string): Promise<{ available: number; reserved: number } | undefined> {
  const { rows } = await pool.query('SELECT available, reserved FROM credit_accounts WHERE user_id = $1', [userId]);
  return rows[0];
}
/** Sends a valid event last and waits for it: once handled, everything sent before it has been. */
async function drain(): Promise<void> {
  const marker = randomUUID();
  await send(marker, registered(marker));
  await waitFor(() => balanceOf(marker));
}

it('creates one wallet with 10 credits from a duplicated UserRegistered', async () => {
  const userId = randomUUID();
  const event = registered(userId);
  await send(userId, event);
  await send(userId, event);
  await drain();

  const { rows } = await pool.query('SELECT count(*)::int AS n FROM credit_accounts WHERE user_id = $1', [userId]);
  expect(rows[0].n).toBe(1);
  expect(await balanceOf(userId)).toEqual({ available: 10, reserved: 0 });
});

it('ignores other event types on user.events', async () => {
  const userId = randomUUID();
  await send(userId, { type: 'UserSuspended', userId });
  await drain();
  expect(await balanceOf(userId)).toBeUndefined();
});

// Review Focus 3
it('sends an unreadable UserRegistered to credit.user-events.dlt without stopping the partition', async () => {
  const dlt = await collect(connection.kafka, topics.userEventsDeadLetter);
  try {
    await send('bad-1', { type: 'UserRegistered', userId: 'not-a-uuid' });
    await send('bad-2', 'not json');
    await drain();

    await waitFor(async () => dlt.messages.length >= 2);
    const [first, second] = dlt.messages;
    expect(first.value?.toString()).toBe(JSON.stringify({ type: 'UserRegistered', userId: 'not-a-uuid' }));
    expect(first.headers?.[HEADER.sourceTopic]?.toString()).toBe(topics.userEvents);
    expect(first.headers?.[HEADER.error]?.toString()).toMatch(/userId/);
    expect(first.headers?.[HEADER.attempt]?.toString()).toBe('1');
    expect(second.value?.toString()).toBe('not json');
  } finally {
    await dlt.stop();
  }
});
