/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
 * Scope: Generated HTTP-level integration tests: status codes, Problem Details bodies, the
 *        service-key check and strict request validation, through a real NestJS app.
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Transfer and release are no longer HTTP routes (team consensus).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { AddressInfo } from 'net';
import { Pool } from 'pg';
import { ProblemDetailsFilter } from '../common/problem';
import { PG_POOL } from '../db/database';
import { emptyTables, openTestDatabase } from '../test/database';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';

const KEY = process.env.CREDIT_SERVICE_KEY!;

let pool: Pool;
let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  pool = await openTestDatabase();

  // The real controller and service, with the test database in place of the configured one.
  @Module({ controllers: [CreditsController], providers: [CreditsService, { provide: PG_POOL, useValue: pool }] })
  class TestModule {}

  app = await NestFactory.create(TestModule, { logger: false });
  app.useGlobalFilters(new ProblemDetailsFilter());
  await app.listen(0);
  baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});
afterAll(async () => {
  await app.close();
  await pool.end();
});
beforeEach(() => emptyTables(pool));

function post(path: string, body: unknown, key: string | null = KEY) {
  return fetch(`${baseUrl}/internal/credits/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key === null ? {} : { 'x-service-key': key }) },
    body: JSON.stringify(body),
  });
}

it('answers 201 for a new reserve and 200 with the same body for a repeat', async () => {
  const body = { orderId: randomUUID(), requesterId: randomUUID(), amount: 3 };
  const first = await post('reserve', body);
  const again = await post('reserve', body);

  expect(first.status).toBe(201);
  expect(again.status).toBe(200);
  expect(await again.json()).toEqual(await first.json());
});

it('answers 409 Problem Details for insufficient credits', async () => {
  const res = await post('reserve', { orderId: randomUUID(), requesterId: randomUUID(), amount: 11 });

  expect(res.status).toBe(409);
  expect(res.headers.get('content-type')).toContain('application/problem+json');
  expect(await res.json()).toMatchObject({ status: 409, detail: 'Insufficient credits to reserve this amount.' });
});

// Team consensus (2026-10-18): transfer and release are Kafka commands on credit.commands only; the
// Order Service doesn't exist yet, so no caller depends on the old HTTP routes. Reserve stays HTTP.
it('no longer offers transfer or release over HTTP', async () => {
  const orderId = randomUUID();
  await post('reserve', { orderId, requesterId: randomUUID(), amount: 3 });

  expect((await post('transfer', { orderId, courierId: randomUUID() })).status).toBe(404);
  expect((await post('release', { orderId })).status).toBe(404);
  const { rows } = await pool.query('SELECT state FROM credit_holds WHERE order_id = $1', [orderId]);
  expect(rows[0].state).toBe('RESERVED');
});

it('rejects a missing or wrong service key with 401 before touching the database', async () => {
  const body = { orderId: randomUUID(), requesterId: randomUUID(), amount: 3 };

  expect((await post('reserve', body, null)).status).toBe(401);
  expect((await post('reserve', body, 'wrong-key')).status).toBe(401);
  const { rowCount } = await pool.query('SELECT 1 FROM credit_holds');
  expect(rowCount).toBe(0);
});

it('rejects unknown fields with 400', async () => {
  const res = await post('reserve', { orderId: randomUUID(), requesterId: randomUUID(), amount: 3, available: 99 });
  expect(res.status).toBe(400);
});
