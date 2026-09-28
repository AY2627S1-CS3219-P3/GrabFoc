/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Added gateway routing and authentication boundary checks; covered implemented User Service routes on 2026-09-28.
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
  response.end(JSON.stringify({ path: request.url, method: request.method, authorization: request.headers.authorization, userId: request.headers['x-user-id'], userRole: request.headers['x-user-role'] }));
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

test('implemented public User routes reach User Service', async () => {
  const routes = [
    ['POST', '/auth/register'], ['POST', '/auth/register/verify'],
    ['POST', '/auth/register/resend-otp'], ['POST', '/auth/login'],
    ['POST', '/auth/refresh'], ['POST', '/auth/password/forgot'],
    ['POST', '/auth/password/reset'], ['GET', '/.well-known/jwks.json'],
  ];
  for (const [method, path] of routes) {
    const response = await fetch(`${gatewayUrl}${path}?source=web`, { method });
    assert.equal(response.status, 201, `${method} ${path}`);
    assert.deepEqual(await response.json(), { path: `${path}?source=web`, method }, `${method} ${path}`);
  }
});

test('implemented protected User routes require a token and forward the verified bearer', async () => {
  const routes = [
    ['POST', '/auth/logout'], ['GET', '/users/me'], ['PATCH', '/users/me'],
    ['GET', '/admin/users'], ['PATCH', '/admin/users/123/role'],
  ];
  for (const [method, path] of routes) {
    assert.equal((await fetch(`${gatewayUrl}${path}`, { method })).status, 401, `${method} ${path}`);
    const response = await fetch(`${gatewayUrl}${path}`, {
      method, headers: { authorization: 'Bearer valid', 'x-user-id': 'forged', 'x-user-role': 'ADMIN' },
    });
    assert.equal(response.status, 201, `${method} ${path}`);
    assert.deepEqual(await response.json(), { path, method, authorization: 'Bearer valid' }, `${method} ${path}`);
  }
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

test('unknown User paths, methods and internal routes are unavailable', async () => {
  const routes = [
    ['POST', '/auth/signup'], ['GET', '/auth/login'], ['POST', '/auth/unknown'],
    ['POST', '/users/me'], ['GET', '/users/123'], ['POST', '/admin/users'],
    ['PATCH', '/admin/users/123/status'], ['GET', '/internal/users/123'], ['GET', '/other'],
  ];
  for (const [method, path] of routes) {
    assert.equal((await fetch(`${gatewayUrl}${path}`, { method })).status, 404, `${method} ${path}`);
  }
});
