/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated integration tests for recording, listing and replaying dead letters (spec §9.2).
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Added the bad x-attempt and replay-without-holding-the-database tests (PR #85 review).
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
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

/** Stamps where the dead letter's original message sat in its source topic. */
function at(message: InboundMessage, partition: number, offset: string): InboundMessage {
  return {
    ...message,
    headers: { ...message.headers, [HEADER.sourcePartition]: String(partition), [HEADER.sourceOffset]: offset },
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
      value: Buffer.from(JSON.stringify({ type: 'ReleaseCredits', eventId, orderId })),
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
  await service.record(at(deadLetter({ raw: 'not json' }), 0, '1'));
  await service.record(at(deadLetter({ raw: 'also not json' }), 0, '2'));
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
    { topic: 'credit.commands', key: orderId, value: Buffer.from(JSON.stringify({ type: 'ReleaseCredits', eventId, orderId })), headers: {} },
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

// PR #85 review: a redelivered unreadable dead letter is the same row, found by its source position.
it('records a redelivered unreadable dead letter once', async () => {
  const message = at(deadLetter({ raw: 'not json' }), 1, '99');
  await service.record(message);
  await service.record(message);
  expect(await service.list('all')).toHaveLength(1);
});

// Security review: Kafka offsets restart when its volume is reset but PostgreSQL keeps its data, so
// a position alone doesn't identify a message forever.
describe('a reused Kafka position', () => {
  it('records a different unreadable message at a reused position', async () => {
    await service.record(at(deadLetter({ raw: 'not json' }), 0, '5'));
    await service.record(at(deadLetter({ raw: 'other junk' }), 0, '5'));
    expect((await service.list('all')).map((r) => r.payload).sort()).toEqual(['not json', 'other junk']);
  });

  it('records a command at a position an unreadable message once held, instead of failing forever', async () => {
    const eventId = randomUUID();
    await service.record(at(deadLetter({ raw: 'not json' }), 0, '5'));
    await expect(service.record(at(deadLetter({ eventId }), 0, '5'))).resolves.toBeUndefined();
    expect((await service.list('all')).map((r) => r.eventId)).toEqual(expect.arrayContaining([null, eventId]));
  });
});

// PR #85 review: PostgreSQL TEXT can't hold a NUL byte; a dead letter must still be recorded, or
// record() would fail forever and block every dead letter behind it.
it('records a dead letter containing a NUL byte', async () => {
  await service.record({ ...at(deadLetter(), 0, '3'), value: Buffer.from([0x6e, 0x00, 0x6f]) });
  expect(await service.list('all')).toHaveLength(1);
});

it('replays the exact bytes it recorded, even when they are not valid UTF-8', async () => {
  const eventId = randomUUID();
  const orderId = randomUUID();
  const bytes = Buffer.concat([
    Buffer.from(`{"type":"ReleaseCredits","eventId":"${eventId}","orderId":"${orderId}","note":"`),
    Buffer.from([0xff]),
    Buffer.from('"}'),
  ]);
  await service.record({ ...deadLetter({ eventId, orderId }), value: bytes });
  await service.replay(eventId);
  expect(publisher.sent[0].value).toEqual(bytes);
});

// PR #85 review: a crash between claiming a replay and sending it must not leave the row stuck.
describe('a replay interrupted by a crash', () => {
  it('can be replayed again once its claim is older than the send timeout', async () => {
    const eventId = randomUUID();
    await service.record(deadLetter({ eventId }));
    // What a crash right after the claim leaves behind: claimed, never sent, never marked.
    await pool.query(
      "UPDATE credit_dead_letters SET replay_claimed_at = now() - interval '10 minutes' WHERE event_id = $1",
      [eventId],
    );
    const replayed = await service.replay(eventId);
    expect(replayed.replayedAt).not.toBeNull();
    expect(publisher.sent).toHaveLength(1);
  });

  it('is not replayed twice at once while a fresh claim is in flight', async () => {
    const eventId = randomUUID();
    await service.record(deadLetter({ eventId }));
    await pool.query('UPDATE credit_dead_letters SET replay_claimed_at = now() WHERE event_id = $1', [eventId]);
    expect(await codeOf(service.replay(eventId))).toBe('ALREADY_REPLAYED');
    expect(publisher.sent).toEqual([]);
  });
});
