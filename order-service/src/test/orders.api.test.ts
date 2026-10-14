/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated HTTP integration tests for the Phase A endpoints against PostgreSQL and a stub JWKS.
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { AppModule, configureApp } from '../app.module';
import { PG_POOL } from '../db/database.module';
import { runMigrations } from '../db/migrator';
import { startJwksStub, type JwksStub } from './jwks-stub';

const connectionString = process.env.ORDER_TEST_DATABASE_URL;
if (!connectionString) throw new Error('ORDER_TEST_DATABASE_URL is required for integration tests');
// A random schema per run, so application tables are never touched.
const schema = `order_api_test_${randomUUID().replaceAll('-', '')}`;
const admin = new Pool({ connectionString });
const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });

const alice = randomUUID(); // requester
const bob = randomUUID(); // courier
const carol = randomUUID(); // unrelated user
let jwks: JwksStub;
let app: INestApplication;
let baseUrl: string;
const tokens: Record<string, string> = {};

before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await runMigrations(pool);
  jwks = await startJwksStub();
  process.env.ORDER_JWKS_URL = jwks.url;
  for (const id of [alice, bob, carol]) tokens[id] = await jwks.sign({ sub: id });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PG_POOL)
    .useValue(pool)
    .compile();
  app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, '127.0.0.1');
  baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});
after(async () => {
  await app.close(); // also ends `pool`
  await jwks.stop();
  try { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
  finally { await admin.end(); }
});
beforeEach(() => pool.query('TRUNCATE order_confirmations, order_history, orders'));

async function insertOrder(overrides: Record<string, unknown> = {}): Promise<string> {
  const fields = {
    order_description: 'Collect stationery', requester_id: alice,
    pickup_location_id: 1, pickup_name: 'COM3', pickup_lat: '1.294900000', pickup_lon: '103.773700000',
    delivery_location_id: 2, delivery_name: 'UTown', delivery_lat: '1.305000000', delivery_lon: '103.773000000',
    credit_offer: 3, ...overrides,
  };
  const keys = Object.keys(fields);
  const { rows } = await pool.query(
    `INSERT INTO orders (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`,
    Object.values(fields),
  );
  return rows[0].id;
}

async function get(path: string, userId?: string) {
  const res = await fetch(baseUrl + path, {
    headers: userId ? { authorization: `Bearer ${tokens[userId]}` } : {},
  });
  return { status: res.status, body: await res.json() };
}

const ids = (body: { items: { id: string }[] }) => body.items.map((o) => o.id);

test('order routes need a token', async () => {
  const { status, body } = await get('/orders/mine');
  assert.equal(status, 401);
  assert.equal(body.error.code, 'TOKEN_INVALID');
});

test('available lists only unexpired PENDING orders from other requesters', async () => {
  const open = await insertOrder();
  await insertOrder({ requester_id: bob }); // bob's own
  await insertOrder({ window_start: '2020-01-01T00:00Z', window_end: '2020-01-02T00:00Z' }); // expired
  await insertOrder({ status: 'ACCEPTED', courier_id: carol });
  const { status, body } = await get('/orders/available', bob);
  assert.equal(status, 200);
  assert.deepEqual(ids(body), [open]);
  assert.equal(body.total, 1);
});

test('mine and assigned list the caller\'s orders in any status, newest first', async () => {
  const first = await insertOrder({ created_at: '2026-10-01T00:00Z' });
  const second = await insertOrder({ status: 'CANCELLED', courier_id: bob, created_at: '2026-10-02T00:00Z' });
  const third = await insertOrder({ status: 'ACCEPTED', courier_id: bob, created_at: '2026-10-03T00:00Z' });
  await insertOrder({ requester_id: carol });

  assert.deepEqual(ids((await get('/orders/mine', alice)).body), [third, second, first]);
  assert.deepEqual(ids((await get('/orders/assigned', bob)).body), [third, second]);
  assert.deepEqual(ids((await get('/orders/assigned', alice)).body), []);
});

test('lists paginate and reject invalid paging parameters', async () => {
  for (let day = 1; day <= 3; day++) await insertOrder({ created_at: `2026-10-0${day}T00:00Z` });
  const { body } = await get('/orders/mine?page=2&pageSize=2', alice);
  assert.equal(body.items.length, 1);
  assert.deepEqual({ page: body.page, pageSize: body.pageSize, total: body.total }, { page: 2, pageSize: 2, total: 3 });

  for (const query of ['pageSize=0', 'pageSize=101', 'status=PENDING']) {
    const res = await get(`/orders/mine?${query}`, alice);
    assert.equal(res.status, 400, query);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  }
});

test('order detail is visible to participants, and to anyone while it is available', async () => {
  const pending = await insertOrder();
  const accepted = await insertOrder({ status: 'ACCEPTED', courier_id: bob });

  const { status, body } = await get(`/orders/${accepted}`, alice);
  assert.equal(status, 200);
  assert.equal(body.id, accepted);
  assert.equal(body.pickupLat, 1.2949); // NUMERIC returned as a JSON number
  assert.equal(body.version, 1);
  assert.ok(!('requester_id' in body));

  assert.equal((await get(`/orders/${accepted}`, bob)).status, 200);
  assert.equal((await get(`/orders/${pending}`, carol)).status, 200);
  assert.equal((await get(`/orders/${accepted}`, carol)).body.error.code, 'FORBIDDEN');
  assert.equal((await get(`/orders/${randomUUID()}`, alice)).status, 404);
  assert.equal((await get('/orders/not-a-uuid', alice)).status, 400);
});

test('history is chronological and limited to participants', async () => {
  const order = await insertOrder({ status: 'ACCEPTED', courier_id: bob });
  await pool.query(
    `INSERT INTO order_history (order_id, actor_id, action, previous_status, new_status, occurred_at) VALUES
     ($1, $3, 'ACCEPTED', 'PENDING', 'ACCEPTED', '2026-10-02T00:00Z'),
     ($1, $2, 'CREATED', NULL, 'PENDING', '2026-10-01T00:00Z')`,
    [order, alice, bob],
  );
  const { status, body } = await get(`/orders/${order}/history`, bob);
  assert.equal(status, 200);
  assert.deepEqual(body.items.map((h: { action: string }) => h.action), ['CREATED', 'ACCEPTED']);
  assert.equal(body.items[0].actorId, alice);

  const pending = await insertOrder();
  assert.equal((await get(`/orders/${pending}/history`, carol)).status, 403);
});
