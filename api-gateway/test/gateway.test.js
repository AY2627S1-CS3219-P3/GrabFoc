/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Added gateway routing and authentication boundary checks; verified refactored routing, request IDs and errors; covered non-origin-form targets, cookie stripping, and added User routes on 2026-09-29.
Author review: Jie Yang reviewed the earlier tests; new security and route cases await his review.
*/
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { after, test } from 'node:test';
import { createGateway } from '../dist/server.js';
import { findRoute, gatewayRoutes } from '../dist/routing/router.js';
import { JwksUnavailableError } from '../dist/auth.js';

// AI-generated (earlier version reviewed by Jie Yang; latest edits pending review)
function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
}

const user = createServer((request, response) => {
  response.writeHead(201, { 'content-type': 'application/json', 'x-request-id': 'upstream-value' });
  if (request.url?.includes('trace=1')) {
    response.end(JSON.stringify({ requestId: request.headers['x-request-id'] }));
    return;
  }
  response.end(JSON.stringify({ path: request.url, method: request.method, authorization: request.headers.authorization, userId: request.headers['x-user-id'], userRole: request.headers['x-user-role'], cookie: request.headers.cookie }));
});
const supplier = createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ path: request.url, authorization: request.headers.authorization, userId: request.headers['x-user-id'], userRole: request.headers['x-user-role'], cookie: request.headers.cookie }));
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
    ['POST', '/users/me/otp'], ['POST', '/users/me/email'],
    ['POST', '/users/me/email/verify'], ['PATCH', '/users/me/mobile'],
    ['POST', '/users/me/password'], ['POST', '/users/me/deactivate'],
    ['GET', '/admin/users'], ['PATCH', '/admin/users/123/role'],
    ['POST', '/admin/users/123/reactivate'],
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

test('cookies are never forwarded to User or Supplier Service', async () => {
  for (const path of ['/.well-known/jwks.json', '/locations']) {
    const response = await fetch(`${gatewayUrl}${path}`, {
      headers: { authorization: 'Bearer valid', cookie: 'foc_refresh=secret' },
    });
    assert.equal((await response.json()).cookie, undefined, path);
  }
});

test('absolute and network-path request targets cannot redirect the proxy', async () => {
  let attackerRequests = 0;
  const attacker = createServer((_request, response) => { attackerRequests++; response.end('reached'); });
  const attackerUrl = await listen(attacker);
  const attackerHost = new URL(attackerUrl).host;
  try {
    for (const target of [`http://${attackerHost}/locations`, `//${attackerHost}/.well-known/jwks.json`]) {
      const result = await new Promise((resolve, reject) => {
        const address = new URL(gatewayUrl);
        const request = httpRequest({ hostname: address.hostname, port: address.port, path: target,
          headers: { authorization: 'Bearer valid', cookie: 'foc_refresh=secret' } }, (response) => {
          response.resume();
          response.on('end', () => resolve(response.statusCode));
        });
        request.on('error', reject);
        request.end();
      });
      assert.equal(result, 400, target);
    }
    assert.equal(attackerRequests, 0);
  } finally { attacker.close(); }
});

test('location types require a token and reach Supplier Service', async () => {
  assert.equal((await fetch(`${gatewayUrl}/location-types`)).status, 401);
  const response = await fetch(`${gatewayUrl}/location-types`, { headers: { authorization: 'Bearer valid' } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { path: '/location-types', authorization: 'Bearer valid' });
});

test('implemented Supplier routes require a token and preserve method and query', async () => {
  const routes = [
    ['GET', '/location-types'], ['GET', '/locations'], ['POST', '/locations'],
    ['GET', '/locations/12'], ['PATCH', '/locations/12'],
    ['POST', '/locations/12/deactivate'], ['POST', '/locations/12/restore'],
  ];
  for (const [method, path] of routes) {
    assert.equal((await fetch(`${gatewayUrl}${path}`, { method })).status, 401, `${method} ${path}`);
    const response = await fetch(`${gatewayUrl}${path}?source=web`, {
      method, headers: { authorization: 'Bearer valid', 'x-user-id': 'forged', 'x-user-role': 'ADMIN' },
    });
    assert.equal(response.status, 200, `${method} ${path}`);
    assert.deepEqual(await response.json(), { path: `${path}?source=web`, authorization: 'Bearer valid' }, `${method} ${path}`);
  }
});

test('unsupported Supplier paths and methods are unavailable', async () => {
  const routes = [
    ['POST', '/location-types'], ['DELETE', '/locations'], ['PUT', '/locations/12'],
    ['DELETE', '/locations/12'], ['GET', '/locations/12/deactivate'],
    ['POST', '/locations/12/other'], ['GET', '/locations/12/extra'],
  ];
  for (const [method, path] of routes) {
    assert.equal((await fetch(`${gatewayUrl}${path}`, { method, headers: { authorization: 'Bearer valid' } })).status, 404, `${method} ${path}`);
  }
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

test('route lookup is independent of ordering and rejects similar malformed paths', () => {
  const routes = gatewayRoutes({ authPrefix: '/auth', locationsPrefix: '/locations' });
  for (const ordered of [routes, [...routes].reverse()]) {
    assert.equal(findRoute(ordered, 'POST', '/locations/12/deactivate')?.service, 'supplier');
    assert.equal(findRoute(ordered, 'POST', '/locations/12/restore')?.service, 'supplier');
    assert.equal(findRoute(ordered, 'GET', '/locations/12')?.service, 'supplier');
    assert.equal(findRoute(ordered, 'PATCH', '/admin/users/123/role')?.service, 'user');
    assert.equal(findRoute(ordered, 'POST', '/locations/12/deactivate/extra'), undefined);
    assert.equal(findRoute(ordered, 'PATCH', '/admin/users/123/role/extra'), undefined);
  }
});

test('request IDs are returned and forwarded to the upstream', async () => {
  const supplied = await fetch(`${gatewayUrl}/auth/login?trace=1`, {
    method: 'POST', headers: { 'x-request-id': 'trace-123' },
  });
  assert.equal(supplied.headers.get('x-request-id'), 'trace-123');
  assert.deepEqual(await supplied.json(), { requestId: 'trace-123' });

  const generated = await fetch(`${gatewayUrl}/auth/login?trace=1`, { method: 'POST' });
  const id = generated.headers.get('x-request-id');
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(await generated.json(), { requestId: id });
});

test('verifier exceptions return 503 while invalid authentication returns 401', async () => {
  const config = {
    port: 3001, userServiceUrl: new URL(userUrl), supplierServiceUrl: new URL(supplierUrl),
    jwksUrl: new URL(`${userUrl}/jwks`), authPrefix: '/auth', locationsPrefix: '/locations',
  };
  const broken = createGateway(config, async () => { throw new JwksUnavailableError('JWKS offline'); });
  const brokenUrl = await listen(broken);
  try {
    const response = await fetch(`${brokenUrl}/locations`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Authentication service unavailable' });
  } finally {
    broken.close();
  }
  assert.equal((await fetch(`${gatewayUrl}/locations`)).status, 401);
});

test('unexpected verifier errors return 500', async () => {
  const config = {
    port: 3001, userServiceUrl: new URL(userUrl), supplierServiceUrl: new URL(supplierUrl),
    jwksUrl: new URL(`${userUrl}/jwks`), authPrefix: '/auth', locationsPrefix: '/locations',
  };
  const broken = createGateway(config, async () => { throw new Error('Unexpected verifier failure'); });
  const brokenUrl = await listen(broken);
  try {
    const response = await fetch(`${brokenUrl}/locations`);
    assert.equal(response.status, 500);
  } finally {
    broken.close();
  }
});

test('unavailable upstream returns 502', async () => {
  const unavailable = createServer();
  const url = await listen(unavailable);
  await new Promise((resolve) => unavailable.close(resolve));
  const config = {
    port: 3001, userServiceUrl: new URL(url), supplierServiceUrl: new URL(supplierUrl),
    jwksUrl: new URL(`${userUrl}/jwks`), authPrefix: '/auth', locationsPrefix: '/locations',
  };
  const broken = createGateway(config, async () => true);
  const brokenUrl = await listen(broken);
  try {
    const response = await fetch(`${brokenUrl}/auth/login`, { method: 'POST' });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'Upstream unavailable' });
  } finally {
    broken.close();
  }
});

test('unexpected gateway errors return 500 before a response starts', async () => {
  const config = {
    port: 3001, userServiceUrl: undefined, supplierServiceUrl: new URL(supplierUrl),
    jwksUrl: new URL(`${userUrl}/jwks`), authPrefix: '/auth', locationsPrefix: '/locations',
  };
  const broken = createGateway(config, async () => true);
  const brokenUrl = await listen(broken);
  try {
    const response = await fetch(`${brokenUrl}/auth/login`, { method: 'POST' });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Internal server error' });
  } finally {
    broken.close();
  }
});
