/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
 * Scope: Generated HTTP-level integration tests: status codes, Problem Details bodies, the
 *        service-key check and strict request validation, through a real NestJS app.
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
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

it('answers 200 for transfer and release, and 404 for an unknown order', async () => {
  const requesterId = randomUUID();
  const paid = randomUUID();
  const cancelled = randomUUID();
  await post('reserve', { orderId: paid, requesterId, amount: 3 });
  await post('reserve', { orderId: cancelled, requesterId, amount: 2 });

  const transfer = await post('transfer', { orderId: paid, courierId: randomUUID() });
  expect(transfer.status).toBe(200);
  expect(await transfer.json()).toMatchObject({ state: 'TRANSFERRED' });

  const release = await post('release', { orderId: cancelled });
  expect(release.status).toBe(200);
  expect(await release.json()).toMatchObject({ state: 'RELEASED' });

  expect((await post('release', { orderId: randomUUID() })).status).toBe(404);
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
