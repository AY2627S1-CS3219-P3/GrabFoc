/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated HTTP-level tests for the balance route: access rule, 404, validation, and the
 *        separation between user tokens and the service key.
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

  const withToken = await fetch(`${baseUrl}/internal/credits/release`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token(alice, 'ADMIN')}` },
    body: JSON.stringify({ orderId: randomUUID() }),
  });
  expect(withToken.status).toBe(401);
});
