/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Added gateway routing and authentication boundary checks, including /location-types and forged identity headers.
Author review: Pending gateway owner review.
*/
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, test } from 'node:test';
import { createGateway } from '../dist/server.js';

// AI-generated (pending human review)
function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
}

const user = createServer((request, response) => {
  response.writeHead(201, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ path: request.url, method: request.method }));
});
const supplier = createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ path: request.url, authorization: request.headers.authorization, userId: request.headers['x-user-id'], userRole: request.headers['x-user-role'] }));
});
const userUrl = await listen(user);
const supplierUrl = await listen(supplier);
const gateway = createGateway({
  port: 3001,
  userServiceUrl: new URL(userUrl),
  supplierServiceUrl: new URL(supplierUrl),
  jwksUrl: new URL(`${userUrl}/jwks`),
  authPrefix: '/auth',
  locationsPrefix: '/locations',
}, async (header) => header === 'Bearer valid');
const gatewayUrl = await listen(gateway);
after(() => { gateway.close(); user.close(); supplier.close(); });

test('health reports gateway state', async () => {
  const response = await fetch(`${gatewayUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('POST auth request reaches User Service with path and query', async () => {
  const response = await fetch(`${gatewayUrl}/auth/signup?source=web`, { method: 'POST' });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { path: '/auth/signup?source=web', method: 'POST' });
});

test('protected location route rejects missing token', async () => {
  const response = await fetch(`${gatewayUrl}/locations`);
  assert.equal(response.status, 401);
});

test('verified request reaches Supplier Service', async () => {
  const response = await fetch(`${gatewayUrl}/locations?status=ACTIVE`, { headers: { authorization: 'Bearer valid' } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { path: '/locations?status=ACTIVE', authorization: 'Bearer valid' });
});

test('caller identity headers are not forwarded to Supplier Service', async () => {
  const response = await fetch(`${gatewayUrl}/locations`, { headers: { authorization: 'Bearer valid', 'x-user-id': 'forged', 'x-user-role': 'ADMIN' } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { path: '/locations', authorization: 'Bearer valid' });
});

test('location types require a token and reach Supplier Service', async () => {
  assert.equal((await fetch(`${gatewayUrl}/location-types`)).status, 401);
  const response = await fetch(`${gatewayUrl}/location-types`, { headers: { authorization: 'Bearer valid' } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { path: '/location-types', authorization: 'Bearer valid' });
});

test('auth GET and unknown paths are unavailable', async () => {
  assert.equal((await fetch(`${gatewayUrl}/auth/signup`)).status, 404);
  assert.equal((await fetch(`${gatewayUrl}/other`)).status, 404);
});
