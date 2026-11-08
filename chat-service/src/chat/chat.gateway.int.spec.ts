/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
 * Scope: Generated an end-to-end socket test (connect, send, receive, history, refusals) for the chat plan.
 * Author review: Reviewed by Deanson, 2026-11-09.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SignJWT } from 'jose';
import type { AddressInfo } from 'net';
import { Pool } from 'pg';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../app.module';
import { PG_POOL } from '../db/database';
import { emptyTables, openTestDatabase } from '../test/database';
import { TEST_TICKET_SECRET } from '../test/env.setup';

let pool: Pool;
let app: INestApplication;
let url: string;
const sockets: Socket[] = [];

const orderId = randomUUID();
const requester = randomUUID();
const courier = randomUUID();

const ticket = (sub: string, order = orderId) =>
  new SignJWT({ orderId: order })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setAudience('chat')
    .setExpirationTime('10s')
    .sign(new TextEncoder().encode(TEST_TICKET_SECRET));

function connect(auth: Record<string, unknown>): Promise<Socket> {
  const socket = io(url, { transports: ['websocket'], auth, reconnection: false, forceNew: true });
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

beforeAll(async () => {
  pool = await openTestDatabase();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PG_POOL)
    .useValue(pool)
    .compile();
  app = moduleRef.createNestApplication({ logger: false });
  await app.listen(0, '127.0.0.1');
  url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});
afterAll(async () => {
  await app.close(); // also ends `pool`
});
beforeEach(() => emptyTables(pool));
afterEach(() => {
  for (const s of sockets.splice(0)) s.disconnect();
});

it('refuses a missing or bad ticket with unauthorized', async () => {
  await expect(connect({})).rejects.toThrow('unauthorized');
  await expect(connect({ ticket: 'not-a-jwt' })).rejects.toThrow('unauthorized');
});

it('delivers a message to the other participant and acks the sender with the saved message', async () => {
  const a = await connect({ ticket: await ticket(requester) });
  const b = await connect({ ticket: await ticket(courier) });
  const outsider = await connect({ ticket: await ticket(randomUUID(), randomUUID()) });
  let outsiderGotIt = false;
  outsider.on('newMessage', () => (outsiderGotIt = true));
  let senderGotIt = false;
  a.on('newMessage', () => (senderGotIt = true));

  const received = new Promise<any>((resolve) => b.once('newMessage', resolve));
  const ack = await a.timeout(5000).emitWithAck('sendMessage', { clientMsgId: 'c1', content: '  hi there  ' });
  expect(ack).toMatchObject({ ok: true, message: { orderId, senderId: requester, clientMsgId: 'c1', content: 'hi there' } });
  expect(await received).toEqual(ack.message);

  // A retry with the same clientMsgId returns the same row.
  const retry = await a.timeout(5000).emitWithAck('sendMessage', { clientMsgId: 'c1', content: 'hi there' });
  expect(retry.message.id).toBe(ack.message.id);

  const history = await b.timeout(5000).emitWithAck('getHistory', {});
  expect(history).toEqual({ ok: true, messages: [ack.message] });
  const missed = await b.timeout(5000).emitWithAck('getMissedMessages', { afterId: 0 });
  expect(missed).toEqual({ ok: true, messages: [ack.message] });

  expect(outsiderGotIt).toBe(false);
  expect(senderGotIt).toBe(false);
});

it('acks invalid payloads with ok: false and saves nothing', async () => {
  const a = await connect({ ticket: await ticket(requester) });
  for (const payload of [
    { clientMsgId: 'c1', content: '   ' },
    { clientMsgId: '', content: 'x' },
    { clientMsgId: 'c1', content: 'x'.repeat(2001) },
    { clientMsgId: 'c1', content: 'x', senderId: randomUUID() },
  ]) {
    const ack = await a.timeout(5000).emitWithAck('sendMessage', payload);
    expect(ack.ok).toBe(false);
    expect(typeof ack.error).toBe('string');
  }
  expect((await a.timeout(5000).emitWithAck('getHistory', { beforeId: 0 })).ok).toBe(false);
  expect((await a.timeout(5000).emitWithAck('getMissedMessages', {})).ok).toBe(false);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM messages');
  expect(rows[0].n).toBe(0);
});
