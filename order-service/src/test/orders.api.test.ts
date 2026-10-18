/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated HTTP integration tests for the Phase A endpoints against PostgreSQL and a stub JWKS.
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Added a fake Supplier/Credit server and create (with credit clean-up), edit and accept tests (Phase B).
 * Author review: Reviewed in full.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Added lifecycle, requester cancellation and confirmation tests (Phase C).
 * Author review: Reviewed
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Replaced the courier timing-change 403 check with a courier proposal that succeeds.
 * Author review: Reviewed
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-17
 * Scope: A fake Credit command producer replaces the fake HTTP release; settlement tests for
 *        transfers, releases, insufficient credits and Kafka being down (Phase D).
 * Author review: Reviewed
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Added expiry worker tests (Phase D).
 * Author review: Reviewed
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: A fake KafkaProducer replaces the fake CreditCommands; order.events and internal
 *        active-order lookup tests (Phase D).
 * Author review: Pending review by Zi Yi.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { AppModule, configureApp } from '../app.module';
import { PG_POOL } from '../db/database.module';
import { CREDIT_COMMANDS_TOPIC, CreditCommand } from '../integrations/credit.commands';
import { KafkaProducer } from '../integrations/kafka.producer';
import { ORDER_EVENTS_TOPIC, OrderEvent, OrderEvents } from '../integrations/order.events';
import { runMigrations } from '../db/migrator';
import { OrdersService } from '../orders/orders.service';
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

// Fake Supplier (GET /locations/:id) and Credit (POST /internal/credits/reserve) on one server.
const location = (id: number, name: string, extra: Record<string, unknown> = {}) =>
  [id, { id, name, lat: 1.2949, lon: 103.7737, status: 'ACTIVE', open_time: null, close_time: null, ...extra }] as const;
const locations = new Map<number, object>([
  location(1, 'COM3', { open_time: '0800hrs', close_time: '2000hrs' }),
  location(2, 'UTown', { lat: 1.305, lon: 103.773 }),
  location(3, 'Closed Kiosk', { status: 'INACTIVE' }),
  location(4, 'Early Cafe', { open_time: '0900hrs', close_time: '1000hrs' }),
  location(5, 'Frontier', { lat: 1.2966, lon: 103.7805 }),
]);
let creditStatus = 201;
let creditCalls: Record<string, unknown>[] = [];
let supplierAuthorization: string | undefined;
const downstream = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url?.startsWith('/locations/')) {
    supplierAuthorization = req.headers.authorization;
    const found = locations.get(Number(req.url.split('/')[2]));
    return res.writeHead(found ? 200 : 404, { 'content-type': 'application/json' }).end(JSON.stringify(found ?? {}));
  }
  let body = '';
  for await (const chunk of req) body += chunk;
  const action = req.url?.split('/').pop();
  creditCalls.push({ action, serviceKey: req.headers['x-service-key'], ...JSON.parse(body) });
  res.writeHead(creditStatus, { 'content-type': 'application/json' }).end('{}');
});

// Records messages instead of sending them to Kafka; `kafkaDown` makes every send fail.
let commands: CreditCommand[] = [];
let events: { key: string; value: OrderEvent }[] = [];
let kafkaDown = false;
class FakeKafkaProducer extends KafkaProducer {
  async onModuleInit() {}
  async onModuleDestroy() {}
  async send(topic: string, key: string, value: object) {
    if (kafkaDown) throw new Error('broker unreachable');
    if (topic === CREDIT_COMMANDS_TOPIC) commands.push(value as CreditCommand);
    else if (topic === ORDER_EVENTS_TOPIC) events.push({ key, value: value as OrderEvent });
    else throw new Error(`unexpected topic ${topic}`);
  }
}
const SERVICE_KEY = 'test-order-service-key-at-least-32-chars';

before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await runMigrations(pool);
  jwks = await startJwksStub();
  process.env.ORDER_JWKS_URL = jwks.url;
  await new Promise<void>((resolve) => downstream.listen(0, '127.0.0.1', resolve));
  const downstreamUrl = `http://127.0.0.1:${(downstream.address() as AddressInfo).port}`;
  process.env.ORDER_SUPPLIER_URL = downstreamUrl;
  process.env.ORDER_CREDIT_URL = downstreamUrl;
  process.env.ORDER_CREDIT_SERVICE_KEY = 'test-service-key';
  process.env.ORDER_KAFKA_BROKERS = 'unused:9092'; // the producer is faked
  process.env.ORDER_SERVICE_KEY = SERVICE_KEY;
  for (const id of [alice, bob, carol]) tokens[id] = await jwks.sign({ sub: id });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PG_POOL)
    .useValue(pool)
    .overrideProvider(KafkaProducer)
    .useClass(FakeKafkaProducer)
    .compile();
  app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, '127.0.0.1');
  baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});
after(async () => {
  await app.close(); // also ends `pool`
  await jwks.stop();
  downstream.close();
  try { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
  finally { await admin.end(); }
});
beforeEach(async () => {
  await pool.query('TRUNCATE order_confirmations, order_history, orders');
  creditStatus = 201;
  creditCalls = [];
  commands = [];
  events = [];
  kafkaDown = false;
});

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

async function send(method: string, path: string, userId?: string, body?: unknown) {
  const res = await fetch(baseUrl + path, {
    method,
    headers: {
      ...(userId ? { authorization: `Bearer ${tokens[userId]}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}
const get = (path: string, userId?: string) => send('GET', path, userId);
const count = async (table: string) => Number((await pool.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);
const row = async (id: string) => (await pool.query('SELECT * FROM orders WHERE id = $1', [id])).rows[0];
const settleCredits = () => app.get(OrdersService).settleCredits();
const expireOrders = () => app.get(OrdersService).expireOrders();
const publishEvents = () => app.get(OrderEvents).publishPending();
const sent = () => commands.map((c) => [c.type, c.orderId]);

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

// ---- Phase B: create, edit, accept ----

const newOrder = (overrides: Record<string, unknown> = {}) => ({
  orderDescription: 'Collect stationery', pickupLocationId: 1, deliveryLocationId: 2, creditOffer: 3, ...overrides,
});
const expectError = (res: { status: number; body: any }, status: number, code: string) => {
  assert.equal(res.status, status, JSON.stringify(res.body));
  assert.equal(res.body.error.code, code);
};

test('create reserves credits, then opens the order as PENDING with snapshots and history', async () => {
  const { status, body } = await send('POST', '/orders', alice, newOrder());
  assert.equal(status, 201);
  assert.equal(body.status, 'PENDING');
  assert.equal(body.requesterId, alice);
  assert.equal(body.courierId, null);
  assert.equal(body.version, 2); // AWAITING_CREDIT → PENDING is an order change
  assert.deepEqual([body.pickupName, body.deliveryName, body.deliveryLat], ['COM3', 'UTown', 1.305]);
  assert.equal(Date.parse(body.windowEnd) - Date.parse(body.windowStart), 24 * 60 * 60 * 1000);

  assert.equal(supplierAuthorization, `Bearer ${tokens[alice]}`);
  assert.deepEqual(creditCalls, [
    { action: 'reserve', serviceKey: 'test-service-key', orderId: body.id, requesterId: alice, amount: 3 },
  ]);
  const history = await get(`/orders/${body.id}/history`, alice);
  assert.deepEqual(history.body.items.map((h: any) => [h.action, h.actorId, h.newStatus]), [
    ['CREATED', alice, 'AWAITING_CREDIT'],
    ['CREDIT_RESERVED', alice, 'PENDING'],
  ]);
});

test('create checks pickup hours but never delivery hours', async () => {
  const window = { windowStart: '2030-01-01T10:30:00+08:00', windowEnd: '2030-01-01T12:00:00+08:00' };
  const ok = await send('POST', '/orders', alice, newOrder({ ...window, deliveryLocationId: 4 })); // Early Cafe closes 10:00
  assert.equal(ok.status, 201);
  assert.equal(ok.body.windowStart, '2030-01-01T02:30:00.000Z');

  const night = { windowStart: '2030-01-01T21:00:00+08:00', windowEnd: '2030-01-01T22:00:00+08:00' };
  expectError(await send('POST', '/orders', alice, newOrder(night)), 400, 'PICKUP_CLOSED');
});

test('a failed reservation cancels the order and releases any hold, unless Credit kept nothing', async () => {
  creditStatus = 409;
  expectError(await send('POST', '/orders', alice, newOrder()), 409, 'INSUFFICIENT_CREDITS');
  creditStatus = 500;
  expectError(await send('POST', '/orders', alice, newOrder()), 503, 'SERVICE_UNAVAILABLE');

  const { rows } = await pool.query('SELECT id, status, credit_settled_at FROM orders ORDER BY created_at');
  assert.deepEqual(rows.map((r) => [r.status, r.credit_settled_at !== null]), [['CANCELLED', true], ['CANCELLED', true]]);
  assert.deepEqual(creditCalls.map((c) => c.action), ['reserve', 'reserve']);
  // Insufficient credits: Credit kept nothing, so only the failed reserve is released.
  assert.deepEqual(sent(), [['ReleaseCredits', rows[1].id]]);
  const history = (await get(`/orders/${rows[0].id}/history`, alice)).body.items;
  assert.deepEqual(history.map((h: any) => [h.action, h.actorId, h.newStatus]), [
    ['CREATED', alice, 'AWAITING_CREDIT'],
    ['CANCELLED', null, 'CANCELLED'],
  ]);
  assert.deepEqual(history[1].changeDetails, { reason: 'CREDIT_NOT_RESERVED' });
  assert.equal((await get('/orders/available', bob)).body.total, 0);
});

test('the settlement job resends commands Kafka did not store and cancels creates that never finished', async () => {
  creditStatus = 500;
  kafkaDown = true;
  expectError(await send('POST', '/orders', alice, newOrder()), 503, 'SERVICE_UNAVAILABLE');
  const [failed] = (await pool.query('SELECT id FROM orders')).rows;
  assert.equal((await row(failed.id)).credit_settled_at, null);

  const stale = await insertOrder({ status: 'AWAITING_CREDIT', created_at: new Date(Date.now() - 60_000) });
  const inFlight = await insertOrder({ status: 'AWAITING_CREDIT' });
  await settleCredits(); // Kafka still down: resent next run
  assert.equal((await row(stale)).status, 'CANCELLED');
  assert.equal((await row(failed.id)).credit_settled_at, null);

  kafkaDown = false;
  await settleCredits();
  assert.deepEqual(sent().sort(), [['ReleaseCredits', failed.id], ['ReleaseCredits', stale]].sort());
  for (const id of [failed.id, stale]) assert.notEqual((await row(id)).credit_settled_at, null);
  assert.equal((await row(inFlight)).status, 'AWAITING_CREDIT');

  await settleCredits(); // settled orders are not sent again
  assert.equal(commands.length, 2);
});

test('create rejects bad locations and invalid bodies before reserving credits', async () => {
  expectError(await send('POST', '/orders', alice, newOrder({ pickupLocationId: 3 })), 409, 'LOCATION_INACTIVE');
  expectError(await send('POST', '/orders', alice, newOrder({ deliveryLocationId: 99 })), 404, 'NOT_FOUND');
  for (const body of [
    newOrder({ requesterId: bob }),
    newOrder({ creditOffer: 0 }),
    newOrder({ creditOffer: 1.5 }),
    newOrder({ orderDescription: ' ' }),
    newOrder({ windowStart: '2030-01-02T10:00:00+08:00', windowEnd: '2030-01-02T09:00:00+08:00' }),
    newOrder({ windowStart: '2020-01-01T10:00:00+08:00', windowEnd: '2020-01-01T11:00:00+08:00' }),
    newOrder({ windowStart: 'tomorrow' }),
  ]) {
    expectError(await send('POST', '/orders', alice, body), 400, 'VALIDATION_ERROR');
  }
  assert.deepEqual(creditCalls, []);
  assert.equal(await count('orders'), 0);
});

test('requester edit refreshes the snapshot, bumps the version and records old and new values', async () => {
  const id = await insertOrder();
  const { status, body } = await send('PATCH', `/orders/${id}`, alice, {
    version: 1, orderDescription: 'Collect printouts', pickupLocationId: 5,
  });
  assert.equal(status, 200);
  assert.deepEqual([body.version, body.orderDescription, body.pickupName, body.pickupLon], [2, 'Collect printouts', 'Frontier', 103.7805]);

  const [edited] = (await get(`/orders/${id}/history`, alice)).body.items;
  assert.equal(edited.action, 'EDITED');
  assert.deepEqual(edited.changeDetails.orderDescription, { from: 'Collect stationery', to: 'Collect printouts' });
  assert.deepEqual(edited.changeDetails.pickupName, { from: 'COM3', to: 'Frontier' });
});

test('edit rejects other users, stale versions, non-PENDING orders, credit changes and closed pickup windows', async () => {
  const id = await insertOrder();
  const patch = (userId: string, body: unknown) => send('PATCH', `/orders/${id}`, userId, body);
  expectError(await patch(bob, { version: 1, orderDescription: 'x' }), 403, 'FORBIDDEN');
  expectError(await patch(alice, { version: 2, orderDescription: 'x' }), 409, 'VERSION_CONFLICT');
  expectError(await patch(alice, { version: 1, creditOffer: 5 }), 400, 'VALIDATION_ERROR');
  expectError(await patch(alice, { version: 1 }), 400, 'VALIDATION_ERROR');
  expectError(
    await patch(alice, { version: 1, windowStart: '2030-01-01T21:00:00+08:00', windowEnd: '2030-01-01T22:00:00+08:00' }),
    400, 'PICKUP_CLOSED',
  );
  expectError(await patch(alice, { version: 1, deliveryLocationId: 3 }), 409, 'LOCATION_INACTIVE');
  assert.equal((await get(`/orders/${id}`, alice)).body.version, 1);
  assert.equal(await count('order_history'), 0);

  const accepted = await insertOrder({ status: 'ACCEPTED', courier_id: bob });
  expectError(await send('PATCH', `/orders/${accepted}`, alice, { version: 1, orderDescription: 'x' }), 409, 'INVALID_STATE');
});

test('courier accept assigns the order and records ACCEPTED history', async () => {
  const id = await insertOrder();
  const { status, body } = await send('POST', `/orders/${id}/accept`, bob, { version: 1 });
  assert.equal(status, 200);
  assert.deepEqual([body.status, body.courierId, body.version], ['ACCEPTED', bob, 2]);
  const history = await get(`/orders/${id}/history`, bob);
  assert.deepEqual(history.body.items.map((h: any) => [h.action, h.actorId]), [['ACCEPTED', bob]]);
});

test('accept rejects self-acceptance, stale versions, expired orders and busy couriers', async () => {
  const id = await insertOrder();
  const accept = (orderId: string, userId: string, version = 1) => send('POST', `/orders/${orderId}/accept`, userId, { version });
  expectError(await accept(id, alice), 403, 'FORBIDDEN');
  expectError(await accept(id, bob, 2), 409, 'VERSION_CONFLICT');
  const expired = await insertOrder({ window_start: '2020-01-01T00:00Z', window_end: '2020-01-02T00:00Z' });
  expectError(await accept(expired, bob), 409, 'INVALID_STATE');

  await insertOrder({ status: 'ACCEPTED', courier_id: bob });
  expectError(await accept(id, bob), 409, 'COURIER_BUSY');
  assert.equal((await get(`/orders/${id}`, alice)).body.status, 'PENDING');
});

test('two couriers accepting at once: exactly one wins', async () => {
  const id = await insertOrder();
  const results = await Promise.all([bob, carol].map((userId) => send('POST', `/orders/${id}/accept`, userId, { version: 1 })));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(results.find((r) => r.status === 409)!.body.error.code, 'INVALID_STATE');
  assert.equal(await count('order_history'), 1);
});

// ---- Phase C: lifecycle, cancellation, confirmations ----

const post = (path: string, userId: string, body: unknown) => send('POST', path, userId, body);
const history = async (id: string) => (await get(`/orders/${id}/history`, alice)).body.items;
const confirmations = (id: string) => `/orders/${id}/confirmations`;
const respond = (id: string, proposal: { body: { id: string } }, userId: string, response: string) =>
  post(`${confirmations(id)}/${proposal.body.id}/respond`, userId, { response });
const expiredWindow = { window_start: '2020-01-01T00:00Z', window_end: '2020-01-02T00:00Z' };
const timingChange = { kind: 'TIMING_CHANGE', windowStart: '2030-01-01T10:00:00+08:00', windowEnd: '2030-01-01T12:00:00+08:00' };
const nightChange = { kind: 'TIMING_CHANGE', windowStart: '2030-01-01T21:00:00+08:00', windowEnd: '2030-01-01T22:00:00+08:00' };

test('the assigned courier moves an order ACCEPTED → PICKED_UP → IN_PROGRESS → ARRIVED with history', async () => {
  const id = await insertOrder({ status: 'ACCEPTED', courier_id: bob });
  let version = 1;
  for (const [step, status] of [['pick-up', 'PICKED_UP'], ['start-delivery', 'IN_PROGRESS'], ['arrive', 'ARRIVED']]) {
    const res = await post(`/orders/${id}/${step}`, bob, { version });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual([res.body.status, res.body.version], [status, ++version]);
  }
  assert.deepEqual((await history(id)).map((h: any) => [h.action, h.actorId, h.previousStatus, h.newStatus]), [
    ['PICKED_UP', bob, 'ACCEPTED', 'PICKED_UP'],
    ['IN_PROGRESS', bob, 'PICKED_UP', 'IN_PROGRESS'],
    ['ARRIVED', bob, 'IN_PROGRESS', 'ARRIVED'],
  ]);
});

test('lifecycle steps reject other users, skipped or repeated steps, stale versions and ended windows', async () => {
  const id = await insertOrder({ status: 'ACCEPTED', courier_id: bob });
  expectError(await post(`/orders/${id}/pick-up`, alice, { version: 1 }), 403, 'FORBIDDEN');
  expectError(await post(`/orders/${id}/pick-up`, carol, { version: 1 }), 403, 'FORBIDDEN');
  expectError(await post(`/orders/${id}/arrive`, bob, { version: 1 }), 409, 'INVALID_STATE'); // skips a step
  expectError(await post(`/orders/${id}/pick-up`, bob, { version: 2 }), 409, 'VERSION_CONFLICT');
  expectError(await post(`/orders/${id}/pick-up`, bob, {}), 400, 'VALIDATION_ERROR');
  assert.equal((await post(`/orders/${id}/pick-up`, bob, { version: 1 })).status, 200);
  expectError(await post(`/orders/${id}/pick-up`, bob, { version: 2 }), 409, 'INVALID_STATE'); // repeated

  const expired = await insertOrder({ status: 'ACCEPTED', courier_id: carol, ...expiredWindow });
  expectError(await post(`/orders/${expired}/pick-up`, carol, { version: 1 }), 409, 'INVALID_STATE');
  assert.equal(await count('order_history'), 1);
});

test('the same step sent twice at once succeeds exactly once', async () => {
  const id = await insertOrder({ status: 'ACCEPTED', courier_id: bob });
  const results = await Promise.all([1, 2].map(() => post(`/orders/${id}/pick-up`, bob, { version: 1 })));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(await count('order_history'), 1);
});

test('the requester cancels a PENDING order, even after its window, and the settlement job releases it', async () => {
  const id = await insertOrder();
  expectError(await post(`/orders/${id}/cancel`, carol, { version: 1 }), 403, 'FORBIDDEN');
  const res = await post(`/orders/${id}/cancel`, alice, { version: 1 });
  assert.deepEqual([res.status, res.body.status, res.body.version], [200, 'CANCELLED', 2]);
  const [entry] = await history(id);
  assert.deepEqual([entry.action, entry.actorId, entry.changeDetails], ['CANCELLED', alice, { reason: 'REQUESTER_CANCELLED' }]);

  const expired = await insertOrder(expiredWindow);
  assert.equal((await post(`/orders/${expired}/cancel`, alice, { version: 1 })).status, 200);
  await settleCredits();
  assert.deepEqual(sent().sort(), [['ReleaseCredits', id], ['ReleaseCredits', expired]].sort());

  const accepted = await insertOrder({ status: 'ACCEPTED', courier_id: bob });
  expectError(await post(`/orders/${accepted}/cancel`, alice, { version: 1 }), 409, 'INVALID_STATE');
});

test('completion needs both participants: the second approval completes the order and the job pays the courier', async () => {
  const id = await insertOrder({ status: 'ARRIVED', courier_id: bob });
  const proposed = await post(confirmations(id), bob, { kind: 'COMPLETION' });
  assert.equal(proposed.status, 201);
  const { proposedBy, status, requesterResponse, courierResponse } = proposed.body;
  assert.deepEqual([proposedBy, status, requesterResponse, courierResponse], [bob, 'PENDING', 'PENDING', 'ACCEPTED']);
  assert.equal((await row(id)).version, 1); // proposing does not change the order

  expectError(await post(confirmations(id), alice, { kind: 'CANCELLATION' }), 409, 'CONFIRMATION_PENDING');
  expectError(await respond(id, proposed, bob, 'ACCEPTED'), 409, 'INVALID_STATE'); // the proposer already accepted
  expectError(await respond(id, proposed, carol, 'ACCEPTED'), 403, 'FORBIDDEN');

  const approved = await respond(id, proposed, alice, 'ACCEPTED');
  assert.deepEqual([approved.status, approved.body.status, approved.body.requesterResponse], [200, 'APPROVED', 'ACCEPTED']);
  assert.notEqual(approved.body.resolvedAt, null);
  assert.deepEqual([(await row(id)).status, (await row(id)).version], ['COMPLETED', 2]);
  const [entry] = await history(id);
  assert.deepEqual([entry.action, entry.actorId, entry.previousStatus, entry.changeDetails], [
    'COMPLETED', alice, 'ARRIVED', { confirmationId: proposed.body.id },
  ]);

  expectError(await respond(id, proposed, alice, 'ACCEPTED'), 409, 'INVALID_STATE'); // already APPROVED
  await settleCredits();
  assert.deepEqual(commands, [{ type: 'TransferCredits', eventId: commands[0]?.eventId, orderId: id, courierId: bob }]);
  assert.match(commands[0].eventId, /^[0-9a-f-]{36}$/);
});

test('proposals check the order state, who proposes and the body', async () => {
  const pending = await insertOrder();
  expectError(await post(confirmations(pending), alice, { kind: 'CANCELLATION' }), 409, 'INVALID_STATE');
  const accepted = await insertOrder({ status: 'ACCEPTED', courier_id: bob });
  expectError(await post(confirmations(accepted), bob, { kind: 'COMPLETION' }), 409, 'INVALID_STATE');
  expectError(await post(confirmations(accepted), carol, { kind: 'CANCELLATION' }), 403, 'FORBIDDEN');
  for (const body of [
    { kind: 'TIMING_CHANGE' },
    { kind: 'COMPLETION', windowStart: timingChange.windowStart },
    { kind: 'REFUND' },
    { ...timingChange, windowEnd: timingChange.windowStart },
  ]) {
    expectError(await post(confirmations(accepted), alice, body), 400, 'VALIDATION_ERROR');
  }
  assert.equal(await count('order_confirmations'), 0);
});

test('mutual cancellation: a rejection changes nothing, an approval cancels even after the window', async () => {
  const id = await insertOrder({ status: 'PICKED_UP', courier_id: bob, ...expiredWindow });
  const first = await post(confirmations(id), alice, { kind: 'CANCELLATION' });
  const rejected = await respond(id, first, bob, 'REJECTED');
  assert.deepEqual([rejected.status, rejected.body.status, rejected.body.courierResponse], [200, 'REJECTED', 'REJECTED']);
  assert.deepEqual([(await row(id)).status, (await row(id)).version], ['PICKED_UP', 1]);

  const second = await post(confirmations(id), bob, { kind: 'CANCELLATION' });
  assert.equal((await respond(id, second, alice, 'ACCEPTED')).status, 200);
  assert.deepEqual([(await row(id)).status, (await row(id)).version], ['CANCELLED', 2]);
  const [entry] = await history(id);
  assert.deepEqual([entry.action, entry.actorId, entry.previousStatus, entry.changeDetails], [
    'CANCELLED', alice, 'PICKED_UP', { reason: 'MUTUAL_CANCELLATION', confirmationId: second.body.id },
  ]);
  await settleCredits();
  assert.deepEqual(sent(), [['ReleaseCredits', id]]);

  const list = await get(confirmations(id), bob);
  assert.deepEqual(list.body.items.map((c: any) => [c.id, c.status]), [[first.body.id, 'REJECTED'], [second.body.id, 'APPROVED']]);
  assert.equal((await get(confirmations(id), carol)).status, 403);
});

test('an approved timing change updates the window and is recorded as an edit', async () => {
  const id = await insertOrder({ status: 'ACCEPTED', courier_id: bob });
  expectError(await post(confirmations(id), alice, nightChange), 400, 'PICKUP_CLOSED'); // COM3 closes at 20:00
  const proposed = await post(confirmations(id), alice, timingChange);
  assert.equal(proposed.body.proposedWindowStart, '2030-01-01T02:00:00.000Z');
  assert.equal((await respond(id, proposed, bob, 'ACCEPTED')).status, 200);

  const order = (await get(`/orders/${id}`, alice)).body;
  assert.deepEqual([order.status, order.windowStart, order.windowEnd, order.version], [
    'ACCEPTED', '2030-01-01T02:00:00.000Z', '2030-01-01T04:00:00.000Z', 2,
  ]);
  const [edited] = await history(id);
  assert.deepEqual([edited.action, edited.actorId, edited.changeDetails.confirmationId], ['EDITED', bob, proposed.body.id]);
  assert.equal(edited.changeDetails.windowEnd.to, '2030-01-01T04:00:00.000Z');

  // Once picked up, pickup hours no longer constrain the window. The courier can propose too.
  await pool.query(`UPDATE orders SET status = 'PICKED_UP' WHERE id = $1`, [id]);
  const byCourier = await post(confirmations(id), bob, nightChange);
  assert.deepEqual([byCourier.status, byCourier.body.courierResponse, byCourier.body.requesterResponse], [201, 'ACCEPTED', 'PENDING']);
});

test('a timing change answered after the current window ends becomes EXPIRED and changes nothing', async () => {
  const id = await insertOrder({ status: 'IN_PROGRESS', courier_id: bob });
  const proposed = await post(confirmations(id), alice, timingChange);
  await pool.query('UPDATE orders SET window_start = $2, window_end = $3 WHERE id = $1', [id, expiredWindow.window_start, expiredWindow.window_end]);

  expectError(await respond(id, proposed, bob, 'ACCEPTED'), 409, 'INVALID_STATE');
  const [expired] = (await get(confirmations(id), alice)).body.items;
  assert.equal(expired.status, 'EXPIRED');
  assert.notEqual(expired.resolvedAt, null);
  assert.equal((await row(id)).version, 1);

  // An ended window blocks new timing changes, but not a cancellation.
  expectError(await post(confirmations(id), alice, timingChange), 409, 'INVALID_STATE');
  assert.equal((await post(confirmations(id), bob, { kind: 'CANCELLATION' })).status, 201);
});

test('arriving supersedes a pending timing change so completion can be proposed', async () => {
  const id = await insertOrder({ status: 'IN_PROGRESS', courier_id: bob });
  const proposed = await post(confirmations(id), alice, timingChange);
  assert.equal((await post(`/orders/${id}/arrive`, bob, { version: 1 })).status, 200);
  expectError(await respond(id, proposed, bob, 'ACCEPTED'), 409, 'INVALID_STATE');
  assert.equal((await get(confirmations(id), alice)).body.items[0].status, 'SUPERSEDED');
  assert.equal((await post(confirmations(id), bob, { kind: 'COMPLETION' })).status, 201);
});

test('two approvals of the same proposal at once complete the order exactly once', async () => {
  const id = await insertOrder({ status: 'ARRIVED', courier_id: bob });
  const proposed = await post(confirmations(id), bob, { kind: 'COMPLETION' });
  const results = await Promise.all([1, 2].map(() => respond(id, proposed, alice, 'ACCEPTED')));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(await count('order_history'), 1);
  assert.equal((await row(id)).version, 2);
});

// ---- Phase D: expiry worker ----

test('the expiry worker cancels ended orders before ARRIVED, and the settlement job releases them', async () => {
  const expirable = ['PENDING', 'ACCEPTED', 'PICKED_UP', 'IN_PROGRESS'];
  const expired = await Promise.all(
    // Separate couriers: each may hold only one active order.
    expirable.map((status) => insertOrder({ status, courier_id: status === 'PENDING' ? null : randomUUID(), ...expiredWindow })),
  );
  const arrived = await insertOrder({ status: 'ARRIVED', courier_id: bob, ...expiredWindow });
  const open = await insertOrder({ status: 'ACCEPTED', courier_id: carol });
  const done = await insertOrder({ status: 'COMPLETED', courier_id: carol, ...expiredWindow });

  await expireOrders();
  for (const [i, id] of expired.entries()) {
    assert.deepEqual([(await row(id)).status, (await row(id)).version], ['CANCELLED', 2]);
    const [entry] = await history(id);
    assert.deepEqual(
      [entry.actorId, entry.action, entry.previousStatus, entry.newStatus, entry.changeDetails],
      [null, 'CANCELLED', expirable[i], 'CANCELLED', { reason: 'EXPIRED' }],
    );
  }
  for (const [id, status] of [[arrived, 'ARRIVED'], [open, 'ACCEPTED'], [done, 'COMPLETED']]) {
    assert.deepEqual([(await row(id)).status, (await row(id)).version], [status, 1]);
  }

  await expireOrders(); // nothing left to expire
  assert.equal(await count('order_history'), 4);
  await settleCredits();
  assert.deepEqual(sent().filter(([type]) => type === 'ReleaseCredits').map(([, id]) => id).sort(), [...expired].sort());
});

test('expiry marks a pending timing change EXPIRED and a pending cancellation SUPERSEDED', async () => {
  const timed = await insertOrder({ status: 'ACCEPTED', courier_id: bob });
  const cancelling = await insertOrder({ status: 'PICKED_UP', courier_id: carol });
  assert.equal((await post(confirmations(timed), alice, timingChange)).status, 201);
  assert.equal((await post(confirmations(cancelling), carol, { kind: 'CANCELLATION' })).status, 201);
  await pool.query('UPDATE orders SET window_start = $1, window_end = $2', [expiredWindow.window_start, expiredWindow.window_end]);

  await expireOrders();
  const [timing] = (await get(confirmations(timed), alice)).body.items;
  const [cancellation] = (await get(confirmations(cancelling), alice)).body.items;
  assert.deepEqual([timing.status, cancellation.status], ['EXPIRED', 'SUPERSEDED']);
  assert.notEqual(timing.resolvedAt, null);
  assert.equal((await row(cancelling)).status, 'CANCELLED');
});

test('expiry waits for a concurrent change and skips the order if it moved on to ARRIVED', async () => {
  const id = await insertOrder({ status: 'IN_PROGRESS', courier_id: bob, ...expiredWindow });
  const other = await pool.connect();
  try {
    await other.query('BEGIN');
    await other.query(`UPDATE orders SET status = 'ARRIVED', version = 2 WHERE id = $1`, [id]);
    const expiring = expireOrders(); // blocks on the row lock
    await new Promise((resolve) => setTimeout(resolve, 200));
    await other.query('COMMIT');
    await expiring;
  } finally {
    other.release();
  }
  assert.equal((await row(id)).status, 'ARRIVED');
  assert.equal(await count('order_history'), 0);
});

// ---- Phase D: order.events ----

const eventTypes = () => events.map((e) => e.value.eventType);

test('each state change is published once to order.events, in order, keyed by order, with its history ID', async () => {
  const id = await insertOrder();
  assert.equal((await post(`/orders/${id}/accept`, bob, { version: 1 })).status, 200);
  for (const [i, step] of ['pick-up', 'start-delivery', 'arrive'].entries()) {
    assert.equal((await post(`/orders/${id}/${step}`, bob, { version: i + 2 })).status, 200);
  }
  const proposed = await post(confirmations(id), bob, { kind: 'COMPLETION' });
  assert.equal((await respond(id, proposed, alice, 'ACCEPTED')).status, 200);

  await publishEvents();
  assert.deepEqual(eventTypes(), ['OrderAccepted', 'OrderPickedUp', 'OrderInProgress', 'OrderArrived', 'OrderCompleted']);
  assert.ok(events.every((e) => e.key === id));
  assert.deepEqual(events.map((e) => e.value.eventId), (await history(id)).map((h: { id: string }) => h.id));
  const completed = events.at(-1)!.value;
  assert.deepEqual(completed.data, { orderId: id, requesterId: alice, courierId: bob, status: 'COMPLETED' });
  assert.ok(!Number.isNaN(Date.parse(completed.occurredAt)));

  await publishEvents(); // already published
  assert.equal(events.length, 5);
});

test('OrderCancelled carries the reason; a create Credit refused publishes nothing', async () => {
  const pending = await insertOrder();
  assert.equal((await post(`/orders/${pending}/cancel`, alice, { version: 1 })).status, 200);
  const expired = await insertOrder({ status: 'ACCEPTED', courier_id: bob, ...expiredWindow });
  await expireOrders();
  creditStatus = 409; // insufficient credits
  expectError(await post('/orders', alice, newOrder()), 409, 'INSUFFICIENT_CREDITS');

  await publishEvents();
  assert.deepEqual(events.map((e) => [e.value.eventType, e.value.data.orderId, e.value.data.courierId, e.value.data.reason]), [
    ['OrderCancelled', pending, null, 'REQUESTER_CANCELLED'],
    ['OrderCancelled', expired, bob, 'EXPIRED'],
  ]);
});

test('events Kafka did not store are resent later with the same event ID', async () => {
  const id = await insertOrder();
  assert.equal((await post(`/orders/${id}/accept`, bob, { version: 1 })).status, 200);
  kafkaDown = true;
  await publishEvents();
  assert.equal(events.length, 0);
  kafkaDown = false;
  await publishEvents();
  assert.deepEqual([eventTypes(), events[0].value.eventId], [['OrderAccepted'], (await history(id))[0].id]);
});

// ---- Phase D: internal active-order lookup ----

const lookup = (userId: string, key?: string) =>
  fetch(`${baseUrl}/internal/orders/users/${userId}/active`, { headers: key ? { 'x-service-key': key } : {} })
    .then(async (res) => ({ status: res.status, body: await res.json() }));

test('the active-order lookup needs the service key, not a user token', async () => {
  expectError(await lookup(alice), 401, 'SERVICE_KEY_INVALID');
  expectError(await lookup(alice, 'wrong-key'), 401, 'SERVICE_KEY_INVALID');
  expectError(await get(`/internal/orders/users/${alice}/active`, alice), 401, 'SERVICE_KEY_INVALID');
  expectError(await lookup('not-a-uuid', SERVICE_KEY), 400, 'VALIDATION_ERROR');
});

test('the active-order lookup counts unfinished orders as requester or courier', async () => {
  const active = async (userId: string) => (await lookup(userId, SERVICE_KEY)).body;
  assert.deepEqual(await active(alice), { userId: alice, hasActiveOrders: false });

  await insertOrder({ status: 'COMPLETED', courier_id: bob });
  await insertOrder({ status: 'CANCELLED' });
  assert.equal((await active(alice)).hasActiveOrders, false);
  assert.equal((await active(bob)).hasActiveOrders, false);

  await insertOrder({ status: 'ARRIVED', courier_id: bob, ...expiredWindow }); // ARRIVED never expires
  assert.equal((await active(alice)).hasActiveOrders, true);
  assert.equal((await active(bob)).hasActiveOrders, true);
  assert.equal((await active(carol)).hasActiveOrders, false);
});
