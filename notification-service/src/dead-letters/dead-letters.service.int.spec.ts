/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Generated the dead-letter recording tests against PostgreSQL (#152), following
 *        credit-service/src/dead-letters/dead-letters.service.int.spec.ts.
 * Author review: pending — Jie Yang to record the review.
 */
import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { HEADER, InboundMessage } from '../messaging/messages';
import { emptyTables, openTestDatabase } from '../test/database';
import { DeadLettersService } from './dead-letters.service';

let pool: Pool;
let service: DeadLettersService;

beforeAll(async () => {
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  pool = await openTestDatabase();
  service = new DeadLettersService(pool);
});
afterAll(async () => {
  await pool?.end();
  jest.restoreAllMocks();
});
beforeEach(async () => {
  await emptyTables(pool);
});

function deadLetter(value: Buffer | string, overrides: Partial<Record<string, string>> = {}, offset = '7'): InboundMessage {
  return {
    topic: 'notification.order-events.dlt',
    partition: 0,
    offset: '0',
    key: 'order-key',
    value: Buffer.from(value),
    headers: {
      [HEADER.attempt]: '1',
      [HEADER.error]: 'Invalid order event: data.status: Invalid enum value',
      [HEADER.sourceTopic]: 'order.events',
      [HEADER.sourcePartition]: '2',
      [HEADER.sourceOffset]: offset,
      [HEADER.deadLetteredAt]: '2026-11-01T10:00:00.000Z',
      ...overrides,
    },
  };
}
const rows = async () => (await pool.query('SELECT * FROM notification_dead_letters ORDER BY id')).rows;

it('stores the exact bytes, error and where the message came from', async () => {
  const eventId = randomUUID();
  const orderId = randomUUID();
  const body = JSON.stringify({ eventId, eventType: 'OrderLost', data: { orderId, status: 'LOST' } });
  await service.record(deadLetter(body));
  const [row] = await rows();
  expect(row).toMatchObject({
    event_id: eventId,
    message_key: 'order-key',
    source_topic: 'order.events',
    source_partition: 2,
    source_offset: '7',
    message_type: 'OrderLost',
    error: 'Invalid order event: data.status: Invalid enum value',
    attempts: 1,
  });
  expect(row.payload).toEqual(Buffer.from(body));
});

it('stores a redelivered dead letter with an event id once', async () => {
  const body = JSON.stringify({ eventId: randomUUID(), data: { status: 'LOST' } });
  await service.record(deadLetter(body));
  await service.record(deadLetter(body));
  expect(await rows()).toHaveLength(1);
});

it('stores a redelivered unreadable dead letter once, by its source position and payload', async () => {
  await service.record(deadLetter('not json'));
  await service.record(deadLetter('not json'));
  expect(await rows()).toHaveLength(1);
  await service.record(deadLetter('not json', {}, '8'));
  expect(await rows()).toHaveLength(2);
});

it('keeps bytes that are not valid UTF-8 and a key containing NUL', async () => {
  const bytes = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]);
  await service.record({ ...deadLetter(bytes), key: 'a\u0000b' });
  const [row] = await rows();
  expect(row.payload).toEqual(bytes);
  expect(row.message_key).toBe('a�b');
});

it('survives bad headers', async () => {
  await service.record(deadLetter('x', { [HEADER.attempt]: '-3', [HEADER.deadLetteredAt]: 'never', [HEADER.sourceOffset]: 'abc' }));
  const [row] = await rows();
  expect(row.attempts).toBe(1);
  expect(row.source_offset).toBeNull();
  expect(row.dead_lettered_at).toBeInstanceOf(Date);
});
