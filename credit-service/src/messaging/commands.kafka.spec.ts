/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated end-to-end tests against a real Kafka broker and PostgreSQL for credit commands:
 *        duplicates, retries, dead letters and replay (spec §7, §9).
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Wrote the 2026-10-18 Author review text above from Jian Bing's account of what he checked (PR #97).
 * Author review: Jian Bing supplied what it states; the wording is Claude's.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Generic envelope columns message_key / message_type.
 * Author review: Jian Bing, 2026-10-19 — manually tested on this branch; it works as described.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Tests for a transfer to a courier with no wallet, now that wallets are never created
 *        lazily (#79; decided by Jian Bing).
 * Author review: Jian Bing, 2026-10-19 — manually tested on this branch; it works as described.
 */
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { ErrorCode } from '../common/error-codes';
import { ProblemException } from '../common/problem';
import { config } from '../config';
import type { TransferRequest } from '../credits/credit.schemas';
import { CreditsService } from '../credits/credits.service';
import { DeadLettersService } from '../dead-letters/dead-letters.service';
import { emptyTables, openTestDatabase } from '../test/database';
import { createTestTopics, testKafkaBrokers, waitFor } from '../test/kafka';
import { KafkaConnection } from './kafka.connection';
import { KafkaRunner } from './kafka.runner';
import { buildTopics } from './topics';

const prefix = `test-${randomUUID().slice(0, 8)}.`;
const topics = buildTopics([1000, 1000], prefix);

/** CreditsService whose next `transferFailures` transfers fail as if the courier had no wallet. */
class FlakyCredits extends CreditsService {
  transferFailures = 0;
  override transfer(request: TransferRequest) {
    if (this.transferFailures > 0) {
      this.transferFailures--;
      return Promise.reject(new ProblemException(404, 'No wallet yet.', ErrorCode.WALLET_NOT_FOUND));
    }
    return super.transfer(request);
  }
}

let pool: Pool;
let credits: FlakyCredits;
let connection: KafkaConnection;
let admin: KafkaJS.Admin;
let deleteTopics: () => Promise<void>;
let deadLetters: DeadLettersService;
let runner: KafkaRunner;
let warn: jest.SpyInstance;

beforeAll(async () => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
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
  deadLetters = new DeadLettersService(pool, connection, topics);
  runner = new KafkaRunner(credits, deadLetters, connection, topics);
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
  credits.transferFailures = 0;
  await emptyTables(pool);
});

const send = (topic: string, key: string, body: unknown) =>
  connection.send({ topic, key, value: typeof body === 'string' ? body : JSON.stringify(body), headers: {} });
async function balanceOf(userId: string): Promise<{ available: number; reserved: number } | undefined> {
  const { rows } = await pool.query('SELECT available, reserved FROM credit_accounts WHERE user_id = $1', [userId]);
  return rows[0];
}
async function deadLetterFor(eventId: string) {
  const { rows } = await pool.query('SELECT * FROM credit_dead_letters WHERE event_id = $1', [eventId]);
  return rows[0];
}
/** Creates the wallets, reserves `amount` for a new order and returns its ids. */
async function reservedOrder(amount = 4, { courierWallet = true } = {}) {
  const ids = { orderId: randomUUID(), requesterId: randomUUID(), courierId: randomUUID() };
  await credits.createWallet(ids.requesterId);
  if (courierWallet) await credits.createWallet(ids.courierId);
  await credits.reserve({ orderId: ids.orderId, requesterId: ids.requesterId, amount });
  return ids;
}

it('moves credits once for a duplicated TransferCredits', async () => {
  const order = await reservedOrder(4);
  const command = { type: 'TransferCredits', eventId: randomUUID(), orderId: order.orderId, courierId: order.courierId };
  await send(topics.commands, order.orderId, command);
  await send(topics.commands, order.orderId, command);
  // Sent last on the same partition, so once it is handled both copies above have been.
  const marker = await reservedOrder(1);
  await send(topics.commands, marker.orderId, { type: 'ReleaseCredits', eventId: randomUUID(), orderId: marker.orderId });
  await waitFor(async () => (await balanceOf(marker.requesterId))?.reserved === 0);

  expect(await balanceOf(order.courierId)).toEqual({ available: 14, reserved: 0 });
  expect(await balanceOf(order.requesterId)).toEqual({ available: 6, reserved: 0 });
});

// Review Focus 1
it('retries a transfer whose wallet is missing, then applies it, without holding up other topics', async () => {
  credits.transferFailures = 2;
  const order = await reservedOrder(3);
  const eventId = randomUUID();
  const started = Date.now();
  await send(topics.commands, order.orderId, { type: 'TransferCredits', eventId, orderId: order.orderId, courierId: order.courierId });

  // While the transfer waits in the retry topics, a user event is still handled.
  const userId = randomUUID();
  await send(topics.userEvents, userId, { type: 'UserRegistered', userId });
  await waitFor(() => balanceOf(userId));
  expect(await balanceOf(order.courierId)).toEqual({ available: 10, reserved: 0 }); // not paid yet

  await waitFor(async () => (await balanceOf(order.courierId))?.available === 13);
  expect(Date.now() - started).toBeGreaterThanOrEqual(2000);
  expect(await deadLetterFor(eventId)).toBeUndefined();
});

it('dead-letters a transfer after its retries run out', async () => {
  credits.transferFailures = 10;
  const order = await reservedOrder(3);
  const eventId = randomUUID();
  await send(topics.commands, order.orderId, { type: 'TransferCredits', eventId, orderId: order.orderId, courierId: order.courierId });

  const row = await waitFor(() => deadLetterFor(eventId));
  expect(row).toMatchObject({ attempts: 3, error_code: 'WALLET_NOT_FOUND', source_topic: topics.commands, replayed_at: null });
  expect(await balanceOf(order.requesterId)).toEqual({ available: 7, reserved: 3 });
});

it('dead-letters a release with no hold at once, and applies it when replayed after the hold exists', async () => {
  const orderId = randomUUID();
  const requesterId = randomUUID();
  const eventId = randomUUID();
  await send(topics.commands, orderId, { type: 'ReleaseCredits', eventId, orderId });
  const row = await waitFor(() => deadLetterFor(eventId));
  expect(row).toMatchObject({ attempts: 1, error_code: 'HOLD_NOT_FOUND' });

  await credits.createWallet(requesterId);
  await credits.reserve({ orderId, requesterId, amount: 2 });
  await deadLetters.replay(eventId);

  await waitFor(async () => (await balanceOf(requesterId))?.reserved === 0);
  expect(await balanceOf(requesterId)).toEqual({ available: 10, reserved: 0 });
  expect((await deadLetterFor(eventId)).replayed_at).not.toBeNull();
});

// AI-generated by Claude Code (#79; decided by Jian Bing)
// #79: a real missing wallet, not FlakyCredits.
it('retries a transfer to a courier with no wallet until UserRegistered creates it', async () => {
  const order = await reservedOrder(3, { courierWallet: false });
  const eventId = randomUUID();
  await send(topics.commands, order.orderId, { type: 'TransferCredits', eventId, orderId: order.orderId, courierId: order.courierId });
  // The first attempt fails for want of a wallet and is scheduled for a retry.
  await waitFor(async () =>
    warn.mock.calls.some(([line]) => {
      const logged = String(line);
      return logged.includes('credit_command_retry_scheduled') && logged.includes(eventId) && logged.includes('WALLET_NOT_FOUND');
    }),
  );
  expect(await balanceOf(order.courierId)).toBeUndefined();
  await send(topics.userEvents, order.courierId, { type: 'UserRegistered', userId: order.courierId });

  await waitFor(async () => (await balanceOf(order.courierId))?.available === 13);
  expect(await balanceOf(order.requesterId)).toEqual({ available: 7, reserved: 0 });
  expect(await deadLetterFor(eventId)).toBeUndefined();
});

it('dead-letters a transfer to a courier who never gets a wallet, and applies it when replayed after one exists', async () => {
  const order = await reservedOrder(3, { courierWallet: false });
  const eventId = randomUUID();
  await send(topics.commands, order.orderId, { type: 'TransferCredits', eventId, orderId: order.orderId, courierId: order.courierId });
  const row = await waitFor(() => deadLetterFor(eventId));
  expect(row).toMatchObject({ attempts: 3, error_code: 'WALLET_NOT_FOUND' });
  expect(await balanceOf(order.courierId)).toBeUndefined();

  await credits.createWallet(order.courierId);
  await deadLetters.replay(eventId);

  await waitFor(async () => (await balanceOf(order.courierId))?.available === 13);
  expect(await balanceOf(order.requesterId)).toEqual({ available: 7, reserved: 0 });
});

// Review Focus 3
it('dead-letters a malformed command without stopping the partition', async () => {
  await send(topics.commands, randomUUID(), 'not json');
  const order = await reservedOrder(2);
  await send(topics.commands, order.orderId, { type: 'ReleaseCredits', eventId: randomUUID(), orderId: order.orderId });

  await waitFor(async () => (await balanceOf(order.requesterId))?.reserved === 0);
  const { rows } = await waitFor(async () => {
    const result = await pool.query("SELECT * FROM credit_dead_letters WHERE payload = 'not json'");
    return result.rowCount ? result : undefined;
  });
  expect(rows[0]).toMatchObject({ event_id: null, error_code: null });
});

it('records an unreadable user event in the table, where it cannot be replayed', async () => {
  const eventId = randomUUID();
  await send(topics.userEvents, 'bad', { type: 'UserRegistered', eventId, userId: 'nope' });
  const row = await waitFor(() => deadLetterFor(eventId));
  expect(row).toMatchObject({ source_topic: topics.userEvents, message_key: 'bad', message_type: 'UserRegistered' });
});
