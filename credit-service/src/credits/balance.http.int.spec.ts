/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated HTTP-level tests for the balance route: access rule, 404, validation, and the
 *        separation between user tokens and the service key.
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Wrote the 2026-10-18 Author review text above from Jian Bing's account of what he checked (PR #97).
 * Author review: Jian Bing supplied what it states; the wording is Claude's.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Added tests for GET /credits/:userId/transactions (route decided by Jian Bing).
 * Author review: Jian Bing, 2026-10-19 — manually tested on this branch; it works as described.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: The token/key separation test uses reserve, since release is no longer an HTTP route.
 * Author review: Jian Bing, 2026-10-18 — manually tested on this branch: unit, integration and Kafka suites pass (incl. transfer/release no longer offered over HTTP); reserve over HTTP, 409 when credits are short, a TransferCredits command over Kafka pays the courier, and repeating it changes nothing.
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
import { emptyTables, openTestDatabase } from '../test/database';
import { JwksStub, makeKey, signToken } from '../test/jwks-stub';
import { BalanceController } from './balance.controller';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';

const stub = new JwksStub();
const key = makeKey('k1');
const alice = randomUUID();
const bob = randomUUID();
let pool: Pool;
let app: INestApplication;
let baseUrl: string;

const token = (sub: string, role: 'USER' | 'ADMIN' = 'USER') => signToken(key, { sub, role });
const get = (path: string, headers: Record<string, string> = {}) => fetch(`${baseUrl}${path}`, { headers });

beforeAll(async () => {
  await stub.start();
  pool = await openTestDatabase();
  @Module({
    controllers: [BalanceController, CreditsController],
    providers: [CreditsService, { provide: PG_POOL, useValue: pool }],
  })
  class TestModule {}
  app = await NestFactory.create(TestModule, { logger: false });
  app.useGlobalFilters(new ProblemDetailsFilter());
  await app.listen(0);
  baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
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
  await emptyTables(pool);
  await pool.query(`INSERT INTO credit_accounts (user_id, available, reserved) VALUES ($1, 7, 3)`, [alice]);
});

it('shows a user their own balance', async () => {
  const res = await get(`/credits/${alice}`, { authorization: `Bearer ${token(alice)}` });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ userId: alice, available: 7, reserved: 3 });
});

// Review Focus 3
it('accepts the caller’s own id in upper case', async () => {
  const res = await get(`/credits/${alice.toUpperCase()}`, { authorization: `Bearer ${token(alice)}` });
  expect(res.status).toBe(200);
});

// Review Focus 1
it('refuses another user’s balance with 403, logs it, and reveals nothing', async () => {
  const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  const res = await get(`/credits/${alice}`, { authorization: `Bearer ${token(bob)}` });
  const body = await res.text();
  expect(res.status).toBe(403);
  expect(body).not.toContain('available');
  expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({ event: 'access_denied', status: 403, userId: bob });
  warn.mockRestore();
});

it('lets an admin read anyone’s balance', async () => {
  const res = await get(`/credits/${alice}`, { authorization: `Bearer ${token(bob, 'ADMIN')}` });
  expect(res.status).toBe(200);
});

it('answers 404 WALLET_NOT_FOUND and creates nothing when there is no wallet', async () => {
  const res = await get(`/credits/${bob}`, { authorization: `Bearer ${token(bob)}` });
  expect(res.status).toBe(404);
  expect(await res.json()).toMatchObject({ code: 'WALLET_NOT_FOUND' });
  const { rowCount } = await pool.query('SELECT 1 FROM credit_accounts WHERE user_id = $1', [bob]);
  expect(rowCount).toBe(0);
});

// Review Focus 2
it.each(['me', 'not-a-uuid', '1'])('answers 400 for the path id "%s"', async (id) => {
  const res = await get(`/credits/${id}`, { authorization: `Bearer ${token(alice, 'ADMIN')}` });
  expect(res.status).toBe(400);
});

it('answers 401 without a token', async () => {
  expect((await get(`/credits/${alice}`)).status).toBe(401);
});

// Review Focus 5
it('keeps user tokens and the service key apart', async () => {
  const withServiceKey = await get(`/credits/${alice}`, { 'x-service-key': config.serviceKey });
  expect(withServiceKey.status).toBe(401);

  const withToken = await fetch(`${baseUrl}/internal/credits/reserve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token(alice, 'ADMIN')}` },
    body: JSON.stringify({ orderId: randomUUID(), requesterId: alice, amount: 1 }),
  });
  expect(withToken.status).toBe(401);
});

// AI-generated by Claude Code (route decided by Jian Bing)
describe('GET /credits/:userId/transactions', () => {
  const order = randomUUID();
  const auth = (sub = alice, role: 'USER' | 'ADMIN' = 'USER') => ({ authorization: `Bearer ${token(sub, role)}` });
  let ids: number[];
  type Page = { items: { id: number; type: string; createdAt: string }[]; nextBefore: number | null };
  const pageOf = async (res: Response) => (await res.json()) as Page;

  // alice's history, oldest first: her grant, then 3 reserved for one order.
  beforeEach(async () => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO credit_transactions (user_id, order_id, type, available_change, reserved_change)
       VALUES ($1, NULL, 'GRANT', 10, 0), ($1, $2, 'RESERVE', -3, 3) RETURNING id`,
      [alice, order],
    );
    ids = rows.map((r) => Number(r.id));
  });

  it('shows a user their own history, newest first', async () => {
    const res = await get(`/credits/${alice}/transactions`, auth());
    expect(res.status).toBe(200);
    const body = await pageOf(res);
    expect(body).toEqual({
      items: [
        { id: ids[1], orderId: order, type: 'RESERVE', availableChange: -3, reservedChange: 3, createdAt: expect.any(String) },
        { id: ids[0], orderId: null, type: 'GRANT', availableChange: 10, reservedChange: 0, createdAt: expect.any(String) },
      ],
      nextBefore: null,
    });
    expect(new Date(body.items[0].createdAt).toISOString()).toBe(body.items[0].createdAt);
  });

  it('pages with limit and before until nextBefore is null', async () => {
    await pool.query(
      `INSERT INTO credit_transactions (user_id, order_id, type, available_change, reserved_change)
       VALUES ($1, $2, 'RELEASE', 3, -3)`,
      [alice, order],
    );
    const seen: string[] = [];
    let path = `/credits/${alice}/transactions?limit=1`;
    for (let page = 0; page < 3; page++) {
      const body = await pageOf(await get(path, auth()));
      expect(body.items).toHaveLength(1);
      seen.push(body.items[0].type);
      if (page < 2) {
        expect(body.nextBefore).toBe(body.items[0].id);
        path = `/credits/${alice}/transactions?limit=1&before=${body.nextBefore}`;
      } else {
        expect(body.nextBefore).toBeNull();
      }
    }
    expect(seen).toEqual(['RELEASE', 'RESERVE', 'GRANT']);
  });

  it('shows only the asked user’s rows', async () => {
    await pool.query(`INSERT INTO credit_accounts (user_id) VALUES ($1)`, [bob]);
    await pool.query(
      `INSERT INTO credit_transactions (user_id, order_id, type, available_change, reserved_change)
       VALUES ($1, NULL, 'GRANT', 10, 0)`,
      [bob],
    );
    const body = await pageOf(await get(`/credits/${bob}/transactions`, auth(bob)));
    expect(body.items).toHaveLength(1);
  });

  it('refuses another user’s history with 403 and reveals nothing', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const res = await get(`/credits/${alice}/transactions`, auth(bob));
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain('GRANT');
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({ event: 'access_denied', status: 403, userId: bob });
    warn.mockRestore();
  });

  it('lets an admin read anyone’s history', async () => {
    const res = await get(`/credits/${alice}/transactions`, auth(bob, 'ADMIN'));
    expect(res.status).toBe(200);
    expect((await pageOf(res)).items).toHaveLength(2);
  });

  it('answers 404 WALLET_NOT_FOUND when there is no wallet', async () => {
    const res = await get(`/credits/${bob}/transactions`, auth(bob));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'WALLET_NOT_FOUND' });
  });

  it.each(['limit=0', 'limit=101', 'limit=abc', 'before=0', 'before=x', 'offset=5', 'limit=1&limit=2'])(
    'answers 400 for ?%s',
    async (query) => {
      const res = await get(`/credits/${alice}/transactions?${query}`, auth());
      expect(res.status).toBe(400);
    },
  );

  it('answers 400 for a bad path id', async () => {
    expect((await get('/credits/me/transactions', auth(alice, 'ADMIN'))).status).toBe(400);
  });

  it('answers 401 without a token', async () => {
    expect((await get(`/credits/${alice}/transactions`)).status).toBe(401);
  });
});
