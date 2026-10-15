/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated end-to-end tests against a real Kafka broker and PostgreSQL for wallets from
 *        UserRegistered and the user-event dead-letter topic (spec §7, §9; K11–K12).
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Added the database-outage retry test (Phase 2 review), the byte-exact dead-letter test
 *        (PR #84 review), and the startup topic check test (K10 revised).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { config } from '../config';
import { CreditsService } from '../credits/credits.service';
import { DeadLettersService } from '../dead-letters/dead-letters.service';
import { emptyTables, openTestDatabase } from '../test/database';
import { collect, createTestTopics, testKafkaBrokers, waitFor } from '../test/kafka';
import { KafkaConnection } from './kafka.connection';
import { KafkaRunner } from './kafka.runner';
import { HEADER } from './messages';
import { buildTopics } from './topics';

// Own topics and consumer group, so a running Credit Service never sees these messages.
const prefix = `test-${randomUUID().slice(0, 8)}.`;
const topics = buildTopics([1000], prefix);

/** CreditsService whose next `walletFailures` wallet writes fail, as if the database were down. */
class FlakyCredits extends CreditsService {
  walletFailures = 0;
  calls = 0;
  override createWallet(userId: string) {
    this.calls++;
    if (this.walletFailures > 0) {
      this.walletFailures--;
      return Promise.reject(new Error('connect ECONNREFUSED (database down)'));
    }
    return super.createWallet(userId);
  }
}

let pool: Pool;
let credits: FlakyCredits;
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
  credits = new FlakyCredits(pool);
  runner = new KafkaRunner(credits, new DeadLettersService(pool, connection, topics), connection, topics);
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
  credits.walletFailures = 0;
  await emptyTables(pool);
});

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
    // Where the original sat, so a redelivered dead letter is recognised (PR #85 review).
    expect(first.headers?.[HEADER.sourcePartition]?.toString()).toBe('0');
    expect(first.headers?.[HEADER.sourceOffset]?.toString()).toMatch(/^\d+$/);
    expect(second.value?.toString()).toBe('not json');
  } finally {
    await dlt.stop();
  }
});

// Review Focus 4
it('retries a wallet whose database write failed, after pausing the partition', async () => {
  credits.walletFailures = 1;
  credits.calls = 0;
  const userId = randomUUID();
  const started = Date.now();
  await send(userId, registered(userId));

  await waitFor(() => balanceOf(userId));
  expect(await balanceOf(userId)).toEqual({ available: 10, reserved: 0 });
  expect(credits.calls).toBe(2);
  // The runner rests the partition for 5 s before reading the message again.
  expect(Date.now() - started).toBeGreaterThanOrEqual(4_500);
});

// PR #84 review: a dead letter must keep the bytes that failed, even when they aren't valid UTF-8.
it('dead-letters an event byte for byte, even when it is not valid UTF-8', async () => {
  const bytes = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]); // "{", two invalid bytes, "}"
  const dlt = await collect(connection.kafka, topics.userEventsDeadLetter);
  try {
    await connection.send({ topic: topics.userEvents, key: 'bad-bytes', value: bytes, headers: {} });
    await drain();
    const message = await waitFor(async () => dlt.messages.find((m) => m.key?.toString() === 'bad-bytes'));
    expect(message.value).toEqual(bytes);
  } finally {
    await dlt.stop();
  }
});

// K10 (revised): topics.txt is the one list of topics, so Credit checks it matches its config.
it('refuses to start when a retry topic in CREDIT_RETRY_DELAYS is missing from Kafka', async () => {
  const other = buildTopics([1000, 1000], `test-${randomUUID().slice(0, 8)}.`);
  const created = [other.userEvents, other.commands, other.retries[0].topic, other.commandsDeadLetter, other.userEventsDeadLetter];
  await admin.createTopics({ timeout: 30_000, topics: created.map((topic) => ({ topic, numPartitions: 1 })) });
  const misconfigured = new KafkaRunner(credits, new DeadLettersService(pool, connection, other), connection, other);
  try {
    await expect(misconfigured.onApplicationBootstrap()).rejects.toThrow(/missing.*retry\.1/);
  } finally {
    await misconfigured.onModuleDestroy();
    await admin.deleteTopics({ topics: created, timeout: 30_000 });
  }
});
