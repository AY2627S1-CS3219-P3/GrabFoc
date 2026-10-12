/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-13
Scope: Compare custom Envoy HTTP/JWT behaviour with the existing gateway and test balancing.
Author review: Pending human review.
*/
// AI-generated; review pending. Requires the custom foc-envoy image and Docker Desktop.
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createServer, request as rawRequest } from 'node:http';
import { spawnSync } from 'node:child_process';
import { before, after, test } from 'node:test';
import { createGateway } from '../dist/app.js';

function docker(...args) {
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`docker ${args[0]} failed: ${result.stderr}`);
  return result.stdout.trim();
}
function listen(server) {
  return new Promise((resolve) => server.listen(0, '0.0.0.0', () => resolve(server.address().port)));
}
function pair(kid, type = 'rsa') {
  const keys = generateKeyPairSync(type, type === 'rsa' ? { modulusLength: 2048 } : { namedCurve: 'P-256' });
  return { ...keys, kid, alg: type === 'rsa' ? 'RS256' : 'ES256',
    jwk: { ...keys.publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: type === 'rsa' ? 'RS256' : 'ES256' } };
}
const old = pair('old');
const rotated = pair('rotated');
const ec = pair('ec', 'ec');
let keyMode = 'ok';
let keys = [old.jwk, ec.jwk];
let fetchCount = 0;
function token(key = old, claims = {}, header = {}) {
  const a = Buffer.from(JSON.stringify({ alg: key.alg, kid: key.kid, ...header })).toString('base64url');
  const b = Buffer.from(JSON.stringify({ sub: 'test-user', role: 'USER',
    exp: Math.floor(Date.now() / 1000) + 300, ...claims })).toString('base64url');
  const signature = sign('sha256', Buffer.from(`${a}.${b}`),
    key.alg === 'ES256' ? { key: key.privateKey, dsaEncoding: 'ieee-p1363' } : key.privateKey);
  return `${a}.${b}.${signature.toString('base64url')}`;
}
const upstream = (instance) => createServer((req, res) => {
  if (req.url === '/.well-known/jwks.json') {
    fetchCount++;
    res.setHeader('content-type', 'application/json');
    if (keyMode === 'unavailable') { res.writeHead(503); res.end('{}'); return; }
    if (keyMode === 'malformed') { res.end('{broken'); return; }
    res.end(JSON.stringify({ keys })); return;
  }
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    res.setHeader('x-request-id', 'upstream-id');
    if (req.headers['x-test-forbidden'] === 'yes') {
      res.writeHead(403); res.end('{"error":"Forbidden"}'); return;
    }
    res.writeHead(instance === 'user' ? 201 : 200);
    res.end(JSON.stringify({ instance, method: req.method, path: req.url,
      authorization: req.headers.authorization, userId: req.headers['x-user-id'],
      userRole: req.headers['x-user-role'], cookie: req.headers.cookie,
      requestId: req.headers['x-request-id'], body: Buffer.concat(chunks).toString() }));
  });
});
const servers = [upstream('user'), upstream('supplier-1'), upstream('supplier-2')];
const containers = [];
let ports, baseline, candidate, balanced;
let baselineServer;

async function startEnvoy(overrides = {}) {
  const env = { GATEWAY_PORT: '3003', USER_SERVICE_URL: `http://host.docker.internal:${ports[0]}`,
    SUPPLIER_SERVICE_URL: `http://host.docker.internal:${ports[1]}`,
    USER_SERVICE_JWKS_URL: `http://host.docker.internal:${ports[0]}/.well-known/jwks.json`, ...overrides };
  const args = ['run', '-d', '--label', 'foc.task=envoy-integration', '-p', '127.0.0.1::3003'];
  if (process.platform === 'linux') args.push('--add-host', 'host.docker.internal:host-gateway');
  for (const [name, value] of Object.entries(env)) args.push('-e', `${name}=${value}`);
  const id = docker(...args, 'foc-envoy:local');
  containers.push(id);
  const mapping = docker('port', id, '3003/tcp');
  const url = `http://${mapping.split('\n')[0]}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(url + '/health')).status === 200) return url; } catch {}
    if (docker('inspect', id, '--format', '{{.State.Running}}') !== 'true') {
      throw new Error(`Envoy exited: ${docker('logs', id)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Envoy did not become ready');
}

before(async () => {
  ports = await Promise.all(servers.map(listen));
  baselineServer = createGateway({ port: 3003, userServiceUrl: new URL(`http://127.0.0.1:${ports[0]}`),
    supplierServiceUrl: new URL(`http://127.0.0.1:${ports[1]}`),
    jwksUrl: new URL(`http://127.0.0.1:${ports[0]}/.well-known/jwks.json`),
    authPrefix: '/auth', locationsPrefix: '/locations' });
  baseline = `http://127.0.0.1:${await listen(baselineServer)}`;
  candidate = await startEnvoy();
});
after(async () => {
  for (const id of containers) docker('rm', '-f', id);
  for (const server of [...servers, baselineServer].filter(Boolean)) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('health and public authentication keep their existing responses', async () => {
  for (const url of [baseline, candidate]) {
    assert.deepEqual(await (await fetch(url + '/health')).json(), { status: 'ok' });
    for (const path of ['register', 'register/verify', 'register/resend-otp', 'login', 'refresh',
      'password/forgot', 'password/reset']) {
      const res = await fetch(`${url}/auth/${path}`, { method: 'POST', body: '{"sample":1}' });
      assert.equal(res.status, 201);
      assert.equal((await res.json()).body, '{"sample":1}');
    }
  }
});

test('unknown methods, paths and internal APIs stay unavailable without a token', async () => {
  for (const url of [baseline, candidate]) {
    for (const [method, path] of [['DELETE', '/locations'], ['GET', '/auth/login'],
      ['POST', '/auth/unknown'], ['GET', '/internal/users/123'], ['GET', '/locations/12/extra'],
      ['GET', '/users/123'], ['POST', '/admin/users']]) {
      const res = await fetch(url + path, { method });
      assert.equal(res.status, 404, `${method} ${path}`);
      assert.deepEqual(await res.json(), { error: 'Not found' });
    }
  }
});

test('JWT invalidity, missing kid, expiry and nbf retain strict 401 JSON errors', async () => {
  const now = Math.floor(Date.now() / 1000);
  const modified = token().split('.');
  modified[2] = (modified[2][0] === 'A' ? 'B' : 'A') + modified[2].slice(1);
  const invalid = [undefined, 'invalid', modified.join('.'), token(old, { exp: now }), token(old, { exp: now - 1 }),
    token(old, { nbf: now + 100 }), token(old, {}, { kid: undefined }),
    token(old, {}, { alg: 'HS256' }), token(old, { exp: undefined })];
  for (const url of [baseline, candidate]) {
    for (const value of invalid) {
      const res = await fetch(url + '/locations', { headers: value ? { authorization: `Bearer ${value}` } : {} });
      assert.equal(res.status, 401);
      assert.deepEqual(await res.json(), { error: 'Unauthorized' });
    }
  }
});

test('RS256 and ES256 forward verified bearer, body, method and query', async () => {
  for (const url of [baseline, candidate]) {
    for (const key of [old, ec]) {
      const value = token(key);
      const res = await fetch(url + '/locations/12?search=tea&sort=name', {
        method: 'PATCH', body: '{"name":"Test"}', headers: { authorization: `Bearer ${value}` } });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.authorization === `Bearer ${value}`, 'verified bearer is preserved');
      assert.equal(data.method, 'PATCH');
      assert.equal(data.path, '/locations/12?search=tea&sort=name');
      assert.equal(data.body, '{"name":"Test"}');
    }
  }
});

test('identity headers and cookies are stripped; safe request IDs remain exact', async () => {
  for (const url of [baseline, candidate]) {
    const res = await fetch(url + '/locations', { headers: { authorization: `Bearer ${token()}`,
      'x-user-id': 'forged', 'x-user-role': 'ADMIN', cookie: 'secret=value', 'x-request-id': 'trace-123' } });
    const data = await res.json();
    assert.equal(data.userId, undefined); assert.equal(data.userRole, undefined); assert.equal(data.cookie, undefined);
    assert.equal(data.requestId, 'trace-123'); assert.equal(res.headers.get('x-request-id'), 'trace-123');
    const generated = await fetch(url + '/health', { headers: { 'x-request-id': 'unsafe/id' } });
    assert.match(generated.headers.get('x-request-id'), /^[a-f0-9-]{36}$/);
  }
});

test('service authorization responses are preserved', async () => {
  for (const url of [baseline, candidate]) {
    const res = await fetch(url + '/locations', { headers: { authorization: `Bearer ${token()}`,
      'x-test-forbidden': 'yes' } });
    assert.equal(res.status, 403); assert.deepEqual(await res.json(), { error: 'Forbidden' });
  }
});

test('unknown key IDs refresh valid cached JWKS immediately', async () => {
  keys = [old.jwk, ec.jwk];
  assert.equal((await fetch(candidate + '/locations', { headers: { authorization: `Bearer ${token()}` } })).status, 200);
  keys = [rotated.jwk];
  const beforeFetches = fetchCount;
  const res = await fetch(candidate + '/locations', { headers: { authorization: `Bearer ${token(rotated)}` } });
  assert.equal(res.status, 200); assert.equal(fetchCount, beforeFetches + 1);
  assert.equal((await fetch(candidate + '/locations', { headers: { authorization: `Bearer ${token(rotated)}` } })).status, 200);
  assert.equal(fetchCount, beforeFetches + 1);
  keys = [old.jwk, ec.jwk];
});

test('JWKS outage and malformed data return existing 503 JSON', async () => {
  for (const mode of ['unavailable', 'malformed']) {
    keyMode = mode;
    try {
      const res = await fetch(candidate + '/locations', { headers: { authorization: `Bearer ${token(old, {}, { kid: 'unknown' })}` } });
      assert.equal(res.status, 503); assert.deepEqual(await res.json(), { error: 'Authentication service unavailable' });
    } finally { keyMode = 'ok'; }
  }
});

test('empty or ineligible JWKS rejects the token with 401', async () => {
  for (const replacement of [[], [{ ...old.jwk, use: 'enc' }], [{ ...old.jwk, kid: undefined }],
    [{ ...old.jwk, alg: 'RS384' }]]) {
    keys = replacement;
    try {
      const url = await startEnvoy();
      const res = await fetch(url + '/locations', { headers: { authorization: `Bearer ${token()}` } });
      assert.equal(res.status, 401); assert.deepEqual(await res.json(), { error: 'Unauthorized' });
    } finally { keys = [old.jwk, ec.jwk]; }
  }
});

test('issuer and audience checks return 401 rather than introducing gateway role checks', async () => {
  const url = await startEnvoy({ GATEWAY_JWT_ISSUER: 'foc-test', GATEWAY_JWT_AUDIENCE: 'foc-browser' });
  for (const claims of [{ iss: 'other', aud: 'foc-browser' }, { iss: 'foc-test', aud: 'other' }]) {
    const res = await fetch(url + '/locations', { headers: { authorization: `Bearer ${token(old, claims)}` } });
    assert.equal(res.status, 401); assert.deepEqual(await res.json(), { error: 'Unauthorized' });
  }
  assert.equal((await fetch(url + '/locations', { headers: { authorization: `Bearer ${token(old,
    { iss: 'foc-test', aud: ['other', 'foc-browser'] })}` } })).status, 200);
});

test('unavailable upstream keeps existing 502 JSON', async () => {
  const url = await startEnvoy({ SUPPLIER_SERVICE_URL: 'http://host.docker.internal:1' });
  const res = await fetch(url + '/locations', { headers: { authorization: `Bearer ${token()}` } });
  assert.equal(res.status, 502); assert.deepEqual(await res.json(), { error: 'Upstream unavailable' });
});

test('non-origin-form request targets cannot redirect the proxy', async () => {
  for (const path of ['http://example.com/locations', '//example.com/locations']) {
    const status = await new Promise((resolve, reject) => {
      const req = rawRequest(candidate, { path }, (res) => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(status, 400);
  }
});

test('round robin reaches two isolated Supplier replicas', async () => {
  balanced = await startEnvoy({ FOC_TEST_SUPPLIER_URLS: JSON.stringify(ports.slice(1).map(
    (port) => `http://host.docker.internal:${port}`)) });
  const instances = new Set();
  for (let n = 0; n < 16; n++) {
    const res = await fetch(balanced + '/locations', { headers: { authorization: `Bearer ${token()}` } });
    assert.equal(res.status, 200); instances.add((await res.json()).instance);
  }
  assert.deepEqual([...instances].sort(), ['supplier-1', 'supplier-2']);
});
