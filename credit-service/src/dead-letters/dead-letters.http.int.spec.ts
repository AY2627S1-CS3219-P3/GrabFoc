/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated HTTP-level tests for the admin dead-letter routes: admin-only access, listing,
 *        replay, and their errors (spec §9.2).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { INestApplication, Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { AddressInfo } from 'net';
import { Pool } from 'pg';
import { resetJwksCache } from '../common/jwks';
import { ProblemDetailsFilter } from '../common/problem';
import { config } from '../config';
import { PG_POOL } from '../db/database';
import { HEADER, PUBLISHER } from '../messaging/messages';
import { buildTopics, TOPICS } from '../messaging/topics';
import { emptyTables, openTestDatabase } from '../test/database';
import { FakePublisher } from '../test/fake-publisher';
import { JwksStub, makeKey, signToken } from '../test/jwks-stub';
import { DeadLettersController } from './dead-letters.controller';
import { DeadLettersService } from './dead-letters.service';

const stub = new JwksStub();
const key = makeKey('k1');
const publisher = new FakePublisher();
let pool: Pool;
let app: INestApplication;
let baseUrl: string;
let service: DeadLettersService;
let eventId: string;

const admin = () => ({ authorization: `Bearer ${signToken(key, { sub: randomUUID(), role: 'ADMIN' })}` });
const user = () => ({ authorization: `Bearer ${signToken(key, { sub: randomUUID(), role: 'USER' })}` });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (res: Response) => (await res.json()) as Record<string, any>;
const call = (method: 'GET' | 'POST', path: string, headers: Record<string, string> = {}) =>
  fetch(`${baseUrl}${path}`, { method, headers });

beforeAll(async () => {
  await stub.start();
  pool = await openTestDatabase();
  @Module({
    controllers: [DeadLettersController],
    providers: [
      DeadLettersService,
      { provide: PG_POOL, useValue: pool },
      { provide: PUBLISHER, useValue: publisher },
      { provide: TOPICS, useValue: buildTopics([1000]) },
    ],
  })
  class TestModule {}
  app = await NestFactory.create(TestModule, { logger: false });
  app.useGlobalFilters(new ProblemDetailsFilter());
  await app.listen(0);
  baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  service = app.get(DeadLettersService);
});
afterAll(async () => {
  await app.close();
  await pool.end();
  await stub.stop();
});
beforeEach(async () => {
  stub.reset([key]);
  config.jwksUrl = stub.url;
  resetJwksCache();
  publisher.sent = [];
  await emptyTables(pool);
  eventId = randomUUID();
  const orderId = randomUUID();
  await service.record({
    topic: 'credit.commands.dlt',
    key: orderId,
    value: Buffer.from(JSON.stringify({ type: 'ReleaseCredits', eventId, orderId })),
    headers: {
      [HEADER.attempt]: '1',
      [HEADER.error]: 'No hold.',
      [HEADER.errorCode]: 'HOLD_NOT_FOUND',
      [HEADER.sourceTopic]: 'credit.commands',
    },
  });
});

it('refuses a request without a token with 401', async () => {
  expect((await call('GET', '/admin/credits/dead-letters')).status).toBe(401);
});

// Review Focus 5
it('refuses a USER on both routes with 403, logs it, and replays nothing', async () => {
  const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  const list = await call('GET', '/admin/credits/dead-letters?status=bogus', user());
  const replay = await call('POST', '/admin/credits/dead-letters/not-a-uuid/replay', user());
  expect([list.status, replay.status]).toEqual([403, 403]);
  expect(await list.text()).not.toContain(eventId);
  expect(publisher.sent).toEqual([]);
  expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({ event: 'access_denied', status: 403, role: 'USER' });
  warn.mockRestore();
});

it('lists open dead letters for an ADMIN', async () => {
  const res = await call('GET', '/admin/credits/dead-letters', admin());
  expect(res.status).toBe(200);
  const body = await json(res);
  expect(body.items).toHaveLength(1);
  expect(body.items[0]).toMatchObject({ eventId, sourceTopic: 'credit.commands', errorCode: 'HOLD_NOT_FOUND', replayedAt: null });
});

it('rejects an unknown status with 400', async () => {
  expect((await call('GET', '/admin/credits/dead-letters?status=bogus', admin())).status).toBe(400);
});

it('replays a dead letter once, then answers 409 ALREADY_REPLAYED', async () => {
  const first = await call('POST', `/admin/credits/dead-letters/${eventId}/replay`, admin());
  expect(first.status).toBe(200);
  expect((await json(first)).replayedAt).not.toBeNull();
  expect(publisher.sent).toHaveLength(1);

  const again = await call('POST', `/admin/credits/dead-letters/${eventId}/replay`, admin());
  expect(again.status).toBe(409);
  expect((await json(again)).code).toBe('ALREADY_REPLAYED');
});

it('answers 404 DEAD_LETTER_NOT_FOUND for an unknown event id', async () => {
  const res = await call('POST', `/admin/credits/dead-letters/${randomUUID()}/replay`, admin());
  expect(res.status).toBe(404);
  expect((await json(res)).code).toBe('DEAD_LETTER_NOT_FOUND');
});

it('rejects an event id that is not a UUID with 400', async () => {
  expect((await call('POST', '/admin/credits/dead-letters/nope/replay', admin())).status).toBe(400);
});
