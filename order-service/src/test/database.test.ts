/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-13
Scope: Generated PostgreSQL integration checks for the approved schema and migration runner.
Author review: Test scope approved; implementation review pending.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
Scope: Updated for migration 002 (applied versions; AWAITING_CREDIT has no courier).
Author review: Reviewed in full.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
Scope: Expect the ninth index, order_history_unpublished_idx (order.events outbox, Phase D).
Author review: Pending review by Zi Yi.
*/
// AI-generated; human review pending.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { Pool } from 'pg';
import { databaseConfig } from '../db/config';
import { migrationsDirectory, runMigrations } from '../db/migrator';

const connectionString = process.env.ORDER_TEST_DATABASE_URL;
if (!connectionString) throw new Error('ORDER_TEST_DATABASE_URL is required for integration tests');
const schema = `order_test_${randomUUID().replaceAll('-', '')}`;
const admin = new Pool({ connectionString, connectionTimeoutMillis: 10000 });
const pool = new Pool({ connectionString, options: `-c search_path=${schema}`, max: 10 });
const requester = randomUUID();
const courier = randomUUID();

before(async () => {
  // Only this test run's random schema is created/removed; existing tables are untouched.
  await admin.query(`CREATE SCHEMA ${schema}`);
  const results = await Promise.all([runMigrations(pool), runMigrations(pool)]);
  assert.deepEqual(results.flat(), ['001_init.sql']); // applied once
});
after(async () => {
  await pool.end();
  try { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
  finally { await admin.end(); }
});
beforeEach(async () => {
  await pool.query('TRUNCATE order_confirmations, order_history, orders');
});

async function order(overrides: Record<string, unknown> = {}) {
  const fields = {
    order_description: 'Collect documents', requester_id: requester,
    pickup_location_id: 1, pickup_name: 'COM3', pickup_lat: '1.296600123', pickup_lon: '103.776400123',
    delivery_location_id: 2, delivery_name: 'UTown', delivery_lat: '1.300000123', delivery_lon: '103.770000123',
    credit_offer: 1, ...overrides,
  };
  const keys = Object.keys(fields);
  const result = await pool.query(
    `INSERT INTO orders (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
    Object.values(fields),
  );
  return result.rows[0];
}
async function proposal(orderId: string, overrides: Record<string, unknown> = {}) {
  const fields = {
    order_id: orderId, kind: 'CANCELLATION', proposed_by: requester,
    requester_response: 'ACCEPTED', courier_response: 'PENDING', ...overrides,
  };
  const keys = Object.keys(fields);
  return pool.query(
    `INSERT INTO order_confirmations (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
    Object.values(fields),
  );
}
const sqlState = (code: string) => (error: unknown) => {
  assert.equal((error as { code: string }).code, code);
  return true;
};

test('migrations serialize, run once and create exactly the nine approved indexes', async () => {
  assert.deepEqual(await runMigrations(pool), []);
  const versions = await pool.query('SELECT version FROM schema_migrations');
  assert.deepEqual(versions.rows, [{ version: '001_init.sql' }]);
  const indexes = await pool.query(`SELECT indexname FROM pg_indexes
    WHERE schemaname = $1 AND indexname NOT LIKE '%_pkey'`, [schema]);
  assert.equal(indexes.rowCount, 9);
});

test('creation generates UUID/timestamps, a 24-hour window and exact snapshot precision', async () => {
  const row = await order();
  assert.match(row.id, /^[0-9a-f-]{36}$/);
  assert.equal(row.status, 'PENDING');
  assert.equal(row.courier_id, null);
  assert.equal(row.version, 1);
  assert.equal(row.window_start.getTime(), row.created_at.getTime());
  assert.equal(row.window_end.getTime() - row.window_start.getTime(), 86400000);
  assert.equal(row.updated_at.getTime(), row.created_at.getTime());
  assert.equal(row.pickup_lat, '1.296600123');
  assert.equal(row.delivery_lon, '103.770000123');
});

test('orders reject invalid state, credits, version, window, party and assignment combinations', async () => {
  for (const fields of [
    { status: 'UNKNOWN' }, { credit_offer: 0 }, { version: 0 },
    { window_end: '2000-01-01T00:00:00Z' }, { courier_id: courier },
    { status: 'ACCEPTED' }, { status: 'ACCEPTED', courier_id: requester },
    { status: 'AWAITING_CREDIT', courier_id: courier },
  ]) await assert.rejects(order(fields), sqlState('23514'));
  await assert.rejects(order({ credit_offer: 1.5 }), sqlState('22P02'));
  await assert.rejects(order({ order_description: null }), sqlState('23502'));
  await order({ status: 'CANCELLED' });
  await order({ status: 'CANCELLED', courier_id: courier });
});

test('active-courier uniqueness includes ARRIVED, but releases after completion/cancellation', async () => {
  for (const status of ['ACCEPTED', 'PICKED_UP', 'IN_PROGRESS', 'ARRIVED']) {
    const active = await order({ status, courier_id: courier });
    await assert.rejects(order({ status: 'ACCEPTED', courier_id: courier }), sqlState('23505'));
    await pool.query("UPDATE orders SET status = 'COMPLETED', version = version + 1 WHERE id = $1", [active.id]);
  }
  const active = await order({ status: 'ACCEPTED', courier_id: courier });
  await pool.query("UPDATE orders SET status = 'CANCELLED', version = version + 1 WHERE id = $1", [active.id]);
  await order({ status: 'ACCEPTED', courier_id: courier });
});

test('simultaneous acceptance of one order assigns exactly one courier', async () => {
  const row = await order();
  const results = await Promise.all([courier, randomUUID()].map(id => pool.query(`
    UPDATE orders SET courier_id = $1, status = 'ACCEPTED', version = version + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2 AND status = 'PENDING' AND courier_id IS NULL AND version = $3 RETURNING id`,
  [id, row.id, row.version])));
  assert.deepEqual(results.map(result => result.rowCount).sort(), [0, 1]);
});

test('simultaneous acceptance of different orders by one courier permits only one assignment', async () => {
  const rows = await Promise.all([order(), order()]);
  const results = await Promise.allSettled(rows.map(row => pool.query(`
    UPDATE orders SET courier_id = $1, status = 'ACCEPTED', version = version + 1
    WHERE id = $2 AND status = 'PENDING' AND courier_id IS NULL AND version = $3`, [courier, row.id, row.version])));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected');
  assert.ok(rejected && rejected.status === 'rejected');
  assert.equal(rejected.reason.code, '23505');
});

test('version-conditional edits cannot overwrite a more recent edit', async () => {
  const row = await order();
  const update = (description: string) => pool.query(`UPDATE orders
    SET order_description = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2 AND version = $3 RETURNING version`, [description, row.id, row.version]);
  assert.equal((await update('New instructions')).rows[0].version, 2);
  assert.equal((await update('Stale instructions')).rowCount, 0);
  const saved = await pool.query('SELECT order_description FROM orders WHERE id = $1', [row.id]);
  assert.equal(saved.rows[0].order_description, 'New instructions');
});

test('order and history commit together and both roll back on failed history write', async () => {
  const row = await order();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("UPDATE orders SET order_description = 'Changed', version = version + 1 WHERE id = $1", [row.id]);
    await client.query(`INSERT INTO order_history(order_id, actor_id, action, change_details)
      VALUES ($1, $2, 'EDITED', $3)`, [row.id, requester, { order_description: { old: 'Collect documents', new: 'Changed' } }]);
    await client.query('COMMIT');
    await client.query('BEGIN');
    await client.query("UPDATE orders SET order_description = 'Must roll back', version = version + 1 WHERE id = $1", [row.id]);
    await assert.rejects(client.query("INSERT INTO order_history(order_id, action) VALUES ($1, 'INVALID')", [row.id]), sqlState('23514'));
    await client.query('ROLLBACK');
  } finally { client.release(); }
  const saved = await pool.query('SELECT order_description, version FROM orders WHERE id = $1', [row.id]);
  assert.deepEqual(saved.rows[0], { order_description: 'Changed', version: 2 });
  assert.equal((await pool.query('SELECT * FROM order_history')).rowCount, 1);
  await pool.query("INSERT INTO order_history(order_id, action, new_status) VALUES ($1, 'CANCELLED', 'CANCELLED')", [row.id]);
});

test('local history/confirmation references reject missing orders and preserve existing history', async () => {
  await assert.rejects(proposal(randomUUID()), sqlState('23503'));
  await assert.rejects(pool.query("INSERT INTO order_history(order_id, action) VALUES ($1, 'CREATED')", [randomUUID()]), sqlState('23503'));
  const row = await order();
  await pool.query("INSERT INTO order_history(order_id, action) VALUES ($1, 'CREATED')", [row.id]);
  await assert.rejects(pool.query('DELETE FROM orders WHERE id = $1', [row.id]), sqlState('23503'));
});

test('confirmation constraints reject invalid values, timing fields and response/status combinations', async () => {
  const row = await order({ status: 'ACCEPTED', courier_id: courier });
  for (const fields of [
    { kind: 'UNKNOWN' }, { requester_response: 'UNKNOWN' }, { status: 'UNKNOWN' },
    { kind: 'TIMING_CHANGE' },
    { kind: 'TIMING_CHANGE', proposed_window_start: '2030-01-02', proposed_window_end: '2030-01-01' },
    { proposed_window_start: '2030-01-01' },
    { status: 'APPROVED', resolved_at: new Date() },
    { status: 'APPROVED', courier_response: 'ACCEPTED' },
    { status: 'REJECTED', resolved_at: new Date() },
    { courier_response: 'REJECTED' },
    { resolved_at: new Date() },
  ]) await assert.rejects(proposal(row.id, fields), sqlState('23514'));
  await proposal(row.id, { kind: 'TIMING_CHANGE', proposed_window_start: '2030-01-01', proposed_window_end: '2030-01-02' });
});

test('simultaneous proposals of different kinds allow only one pending proposal', async () => {
  const row = await order({ status: 'ARRIVED', courier_id: courier });
  const results = await Promise.allSettled([
    proposal(row.id), proposal(row.id, { kind: 'COMPLETION' }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected');
  assert.ok(rejected && rejected.status === 'rejected');
  assert.equal(rejected.reason.code, '23505');
  await pool.query(`UPDATE order_confirmations SET status = 'REJECTED', courier_response = 'REJECTED', resolved_at = CURRENT_TIMESTAMP WHERE order_id = $1`, [row.id]);
  await proposal(row.id, { kind: 'COMPLETION' });
  assert.equal((await pool.query('SELECT * FROM order_confirmations WHERE order_id = $1', [row.id])).rowCount, 2);
});

test('all resolved confirmation states can be retained and terminal invalidation commits transactionally', async () => {
  const row = await order({ status: 'ACCEPTED', courier_id: courier });
  await proposal(row.id, { status: 'APPROVED', courier_response: 'ACCEPTED', resolved_at: new Date() });
  await proposal(row.id, { kind: 'TIMING_CHANGE', proposed_window_start: '2030-01-01', proposed_window_end: '2030-01-02', status: 'EXPIRED', resolved_at: new Date() });
  await proposal(row.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("UPDATE orders SET status = 'CANCELLED', version = version + 1 WHERE id = $1", [row.id]);
    await client.query("UPDATE order_confirmations SET status = 'SUPERSEDED', resolved_at = CURRENT_TIMESTAMP WHERE order_id = $1 AND status = 'PENDING'", [row.id]);
    await client.query("INSERT INTO order_history(order_id, action, previous_status, new_status, change_details) VALUES ($1, 'CANCELLED', 'ACCEPTED', 'CANCELLED', $2)", [row.id, { reason: 'TIMEOUT' }]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  assert.equal((await pool.query("SELECT * FROM order_confirmations WHERE status = 'SUPERSEDED'")).rowCount, 1);
  assert.equal((await pool.query("SELECT * FROM order_confirmations WHERE status = 'PENDING'")).rowCount, 0);
});

test('failed migrations roll back schema/data and version, and release the migration lock', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'order-migrations-'));
  try {
    await writeFile(join(directory, '001_init.sql'), await readFile(join(migrationsDirectory, '001_init.sql')));
    await writeFile(join(directory, '002_test.sql'), 'CREATE TABLE migration_probe(id INTEGER); INSERT INTO migration_probe VALUES (1); SELECT * FROM missing_test_relation;');
    await assert.rejects(runMigrations(pool, directory), /Migration 002_test.sql failed/);
    assert.equal((await pool.query("SELECT to_regclass('migration_probe') AS name")).rows[0].name, null);
    assert.equal((await pool.query("SELECT * FROM schema_migrations WHERE version = '002_test.sql'")).rowCount, 0);
    await writeFile(join(directory, '002_test.sql'), 'CREATE TABLE migration_probe(id INTEGER);');
    assert.deepEqual(await runMigrations(pool, directory), ['002_test.sql']);
    assert.deepEqual(await runMigrations(pool, directory), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('database config validates required settings and port without echoing values', () => {
  assert.throws(() => databaseConfig({}), /Missing ORDER_DB_HOST/);
  const env = { ORDER_DB_HOST: 'localhost', ORDER_DB_NAME: 'orders', ORDER_DB_USER: 'foc', ORDER_DB_PASSWORD: 'test-only' };
  assert.equal(databaseConfig(env).port, 5432);
  for (const port of ['0', '65536', 'abc', '5432x']) {
    assert.throws(() => databaseConfig({ ...env, ORDER_DB_PORT: port }), /Invalid ORDER_DB_PORT/);
  }
});
