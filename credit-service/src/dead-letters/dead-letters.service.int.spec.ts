/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated integration tests for recording, listing and replaying dead letters (spec §9.2).
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Added the bad x-attempt and replay-without-holding-the-database tests (PR #85 review).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { ProblemException } from '../common/problem';
import { HEADER, InboundMessage } from '../messaging/messages';
import { buildTopics } from '../messaging/topics';
import { emptyTables, openTestDatabase } from '../test/database';
import { FakePublisher } from '../test/fake-publisher';
import { DeadLettersService } from './dead-letters.service';

const topics = buildTopics([1000]);
let pool: Pool;
let publisher: FakePublisher;
let service: DeadLettersService;

beforeAll(async () => {
  pool = await openTestDatabase();
});
afterAll(() => pool.end());
beforeEach(async () => {
  await emptyTables(pool);
  publisher = new FakePublisher();
  service = new DeadLettersService(pool, publisher, topics);
});

function deadLetter(
  overrides: { eventId?: string; orderId?: string; at?: string; code?: string; raw?: string; source?: string } = {},
): InboundMessage {
  const eventId = overrides.eventId ?? randomUUID();
  const orderId = overrides.orderId ?? randomUUID();
  return {
    topic: topics.commandsDeadLetter,
    key: orderId,
    value: Buffer.from(overrides.raw ?? JSON.stringify({ type: 'ReleaseCredits', eventId, orderId })),
    headers: {
      [HEADER.attempt]: '1',
      [HEADER.error]: 'No hold.',
      [HEADER.errorCode]: overrides.code ?? 'HOLD_NOT_FOUND',
      [HEADER.sourceTopic]: overrides.source ?? topics.commands,
      [HEADER.deadLetteredAt]: overrides.at ?? '2026-10-15T10:00:00.000Z',
    },
  };
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ProblemException) return err.code;
    throw err;
  }
  throw new Error('expected the call to fail');
}

it('records a dead letter with its ids, source, error and attempts', async () => {
  const eventId = randomUUID();
  const orderId = randomUUID();
  await service.record(deadLetter({ eventId, orderId }));
  expect(await service.list('open')).toEqual([
    {
      eventId,
      orderId,
      sourceTopic: 'credit.commands',
      commandType: 'ReleaseCredits',
      payload: JSON.stringify({ type: 'ReleaseCredits', eventId, orderId }),
      error: 'No hold.',
      errorCode: 'HOLD_NOT_FOUND',
      attempts: 1,
      deadLetteredAt: '2026-10-15T10:00:00.000Z',
      replayedAt: null,
    },
  ]);
});

it('replays a command to credit.commands with a fresh attempt count, once', async () => {
  const eventId = randomUUID();
  const orderId = randomUUID();
  await service.record(deadLetter({ eventId, orderId }));

  const replayed = await service.replay(eventId);

  expect(replayed.replayedAt).not.toBeNull();
  expect(publisher.sent).toEqual([
    {
      topic: 'credit.commands',
      key: orderId,
      value: JSON.stringify({ type: 'ReleaseCredits', eventId, orderId }),
      headers: {},
    },
  ]);
  expect(await service.list('open')).toEqual([]);
  expect(await service.list('replayed')).toHaveLength(1);
  expect(await codeOf(service.replay(eventId))).toBe('ALREADY_REPLAYED');
  expect(publisher.sent).toHaveLength(1);
});

it('answers DEAD_LETTER_NOT_FOUND for an unknown event id', async () => {
  expect(await codeOf(service.replay(randomUUID()))).toBe('DEAD_LETTER_NOT_FOUND');
});

// Review Focus 5
it('refuses to replay a user-event dead letter: it must be fixed at its source', async () => {
  const eventId = randomUUID();
  await service.record({
    topic: topics.userEventsDeadLetter,
    key: 'u1',
    value: Buffer.from(JSON.stringify({ type: 'UserRegistered', eventId, userId: 'bad' })),
    headers: { [HEADER.attempt]: '1', [HEADER.error]: 'Invalid UserRegistered event', [HEADER.sourceTopic]: topics.userEvents },
  });
  expect(await codeOf(service.replay(eventId))).toBe('NOT_REPLAYABLE');
  expect(publisher.sent).toEqual([]);
  expect((await service.list('open'))[0]).toMatchObject({ sourceTopic: 'user.events', commandType: 'UserRegistered' });
});

it('keeps the row open when Kafka refuses the replay, so it can be tried again', async () => {
  const eventId = randomUUID();
  await service.record(deadLetter({ eventId }));
  publisher.failNext = true;
  await expect(service.replay(eventId)).rejects.toThrow('Kafka is unavailable');
  expect(await service.list('open')).toHaveLength(1);
});

// Review Focus 2
it('reopens the row when a replayed command dies again', async () => {
  const eventId = randomUUID();
  await service.record(deadLetter({ eventId }));
  await service.replay(eventId);
  await service.record(deadLetter({ eventId, at: '2026-10-15T11:00:00.000Z', code: 'ALREADY_TRANSFERRED' }));

  const [row] = await service.list('open');
  expect(row).toMatchObject({ eventId, errorCode: 'ALREADY_TRANSFERRED', replayedAt: null });
  expect(row.deadLetteredAt).toBe('2026-10-15T11:00:00.000Z');
});

// Review Focus 2
it('does not reopen a replayed row for an older duplicate of the same dead letter', async () => {
  const eventId = randomUUID();
  await service.record(deadLetter({ eventId }));
  await service.replay(eventId);
  await service.record(deadLetter({ eventId }));
  expect(await service.list('open')).toEqual([]);
});

// Review Focus 3
it('keeps two malformed messages apart instead of overwriting one', async () => {
  await service.record(deadLetter({ raw: 'not json' }));
  await service.record(deadLetter({ raw: 'also not json' }));
  const rows = await service.list('all');
  expect(rows.map((r) => [r.eventId, r.payload])).toEqual(
    expect.arrayContaining([
      [null, 'not json'],
      [null, 'also not json'],
    ]),
  );
});

it('lists newest first', async () => {
  const older = randomUUID();
  const newer = randomUUID();
  await service.record(deadLetter({ eventId: older, at: '2026-10-15T09:00:00.000Z' }));
  await service.record(deadLetter({ eventId: newer, at: '2026-10-15T12:00:00.000Z' }));
  expect((await service.list('all')).map((r) => r.eventId)).toEqual([newer, older]);
});

// Security review: dead letters from different sources must not overwrite each other.
it('keeps a command dead letter when a user-event dead letter reuses its event id', async () => {
  const eventId = randomUUID();
  const orderId = randomUUID();
  await service.record(deadLetter({ eventId, orderId }));
  await service.record({
    topic: topics.userEventsDeadLetter,
    key: 'forged',
    value: Buffer.from(JSON.stringify({ type: 'UserRegistered', eventId, userId: 'bad' })),
    headers: {
      [HEADER.attempt]: '1',
      [HEADER.error]: 'Invalid UserRegistered event',
      [HEADER.sourceTopic]: topics.userEvents,
      [HEADER.deadLetteredAt]: '2026-10-15T12:00:00.000Z',
    },
  });

  const rows = await service.list('all');
  expect(rows.map((r) => r.sourceTopic).sort()).toEqual(['credit.commands', 'user.events']);
  await service.replay(eventId);
  expect(publisher.sent).toEqual([
    { topic: 'credit.commands', key: orderId, value: JSON.stringify({ type: 'ReleaseCredits', eventId, orderId }), headers: {} },
  ]);
});

// PR #85 review: a bad x-attempt must not break the insert (CHECK attempts > 0).
it('records a dead letter whose x-attempt is negative or not a number as 1 attempt', async () => {
  const neg = randomUUID();
  const junk = randomUUID();
  await service.record({ ...deadLetter({ eventId: neg }), headers: { ...deadLetter().headers, [HEADER.attempt]: '-5' } });
  await service.record({ ...deadLetter({ eventId: junk }), headers: { ...deadLetter().headers, [HEADER.attempt]: 'many' } });
  const attempts = Object.fromEntries((await service.list('all')).map((r) => [r.eventId, r.attempts]));
  expect(attempts).toEqual({ [neg]: 1, [junk]: 1 });
});

// PR #85 review: a slow or unreachable broker must not pin a database connection or the row lock.
it('holds no row lock while it waits for Kafka during a replay', async () => {
  const eventId = randomUUID();
  await service.record(deadLetter({ eventId }));
  let lockedByReplay: boolean | undefined;
  publisher.during = async () => {
    const client = await pool.connect();
    try {
      // NOWAIT fails at once if another transaction (the replay) holds the row's lock.
      await client.query('SELECT 1 FROM credit_dead_letters WHERE event_id = $1 FOR UPDATE NOWAIT', [eventId]);
      lockedByReplay = false;
    } catch {
      lockedByReplay = true;
    } finally {
      client.release();
    }
  };
  await service.replay(eventId);
  expect(lockedByReplay).toBe(false);
  expect((await service.list('replayed')).map((r) => r.eventId)).toEqual([eventId]);
});

// The consumer can dead-letter the replayed command again before replay() returns; that new
// failure must leave the row open, not be hidden by the replay marking it.
it('keeps the row open when the replayed command dies again while the replay is finishing', async () => {
  const eventId = randomUUID();
  await service.record(deadLetter({ eventId }));
  publisher.during = () =>
    service.record(deadLetter({ eventId, at: new Date(Date.now() + 1000).toISOString(), code: 'ALREADY_TRANSFERRED' }));
  await service.replay(eventId);
  expect(await service.list('open')).toEqual([expect.objectContaining({ eventId, errorCode: 'ALREADY_TRANSFERRED' })]);
});
