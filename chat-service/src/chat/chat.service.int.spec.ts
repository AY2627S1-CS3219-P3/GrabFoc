/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
 * Scope: Generated the database tests listed in the chat plan
 * Author review: Reviewed by Deanson, 2026-11-09.
 */
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import '../db/database'; // registers the BIGINT parser
import { emptyTables, openTestDatabase } from '../test/database';
import { ChatService } from './chat.service';

let pool: Pool;
let chat: ChatService;
const orderId = randomUUID();
const sender = randomUUID();

beforeAll(async () => {
  pool = await openTestDatabase();
  chat = new ChatService(pool);
});
afterAll(() => pool.end());
beforeEach(() => emptyTables(pool));

describe('saveMessage', () => {
  it('saves one row for a retried clientMsgId and returns the same message', async () => {
    const first = await chat.saveMessage(orderId, sender, 'm-1', 'hello');
    const retry = await chat.saveMessage(orderId, sender, 'm-1', 'hello');
    expect(retry).toEqual(first);
    expect(typeof first.id).toBe('number');
    expect(first).toMatchObject({ orderId, senderId: sender, clientMsgId: 'm-1', content: 'hello' });
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM messages');
    expect(rows[0].n).toBe(1);
  });

  it('lets other senders and orders reuse a clientMsgId', async () => {
    await chat.saveMessage(orderId, sender, 'm-1', 'a');
    await chat.saveMessage(orderId, randomUUID(), 'm-1', 'b');
    await chat.saveMessage(randomUUID(), sender, 'm-1', 'c');
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM messages');
    expect(rows[0].n).toBe(3);
  });
});

describe('paging', () => {
  async function seed(count: number) {
    const ids: number[] = [];
    for (let i = 0; i < count; i++) ids.push((await chat.saveMessage(orderId, sender, `m-${i}`, `msg ${i}`)).id);
    await chat.saveMessage(randomUUID(), sender, 'other', 'another order'); // never returned
    return ids;
  }

  it('getMessagesBefore returns the newest 50 oldest first, and beforeId the page before', async () => {
    const ids = await seed(120);
    const newest = await chat.getMessagesBefore(orderId);
    expect(newest.map((m) => m.id)).toEqual(ids.slice(70));
    const older = await chat.getMessagesBefore(orderId, newest[0].id);
    expect(older.map((m) => m.id)).toEqual(ids.slice(20, 70));
    const oldest = await chat.getMessagesBefore(orderId, older[0].id);
    expect(oldest.map((m) => m.id)).toEqual(ids.slice(0, 20));
  });

  it('getMessagesAfter returns up to 50 after afterId, oldest first', async () => {
    const ids = await seed(60);
    expect((await chat.getMessagesAfter(orderId, 0)).map((m) => m.id)).toEqual(ids.slice(0, 50));
    expect((await chat.getMessagesAfter(orderId, ids[49])).map((m) => m.id)).toEqual(ids.slice(50));
    expect(await chat.getMessagesAfter(orderId, ids[59])).toEqual([]);
  });

  it('an empty chat returns no messages', async () => {
    expect(await chat.getMessagesBefore(orderId)).toEqual([]);
  });
});
