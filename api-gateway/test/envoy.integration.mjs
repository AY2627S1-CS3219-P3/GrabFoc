/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-13
Scope: Verify Envoy routing and JWT behavior, including approved JWKS 503 mapping and recovery.
Author review: Pending human review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
Scope: Added a per-attempt timeout to the Envoy readiness check, which hung on Linux CI runners.
Author review: Pending Jie Yang's review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-20
Scope: Added POST /admin/users/:userId/suspend to the protected-route cases (#72).
Author review: Pending Zi Yi's and Jie Yang's review.
*/
// AI-generated; review pending. Requires the stock foc-envoy image and Docker Desktop.
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createServer, request as rawRequest } from 'node:http';
import { spawnSync } from 'node:child_process';
import { before, after, test } from 'node:test';

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
  const signature = sign(key.alg === 'RS384' ? 'sha384' : 'sha256', Buffer.from(`${a}.${b}`),
    key.alg === 'ES256' ? { key: key.privateKey, dsaEncoding: 'ieee-p1363' } : key.privateKey);
  return `${a}.${b}.${signature.toString('base64url')}`;
}
const upstream = (instance) => createServer((req, res) => {
  if (req.url === '/.well-known/jwks.json') {
    fetchCount++;
    res.setHeader('content-type', 'application/json');
    if (keyMode === 'unavailable') { res.writeHead(503); res.end('{}'); return; }
    if (keyMode === 'malformed') { res.end('{broken'); return; }
    if (keyMode === 'missing-keys') { res.end('{}'); return; }
    if (keyMode === 'bad-keys') { res.end('{"keys":{}}'); return; }
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
    if (req.headers['x-test-unauthorized'] === 'yes') {
      res.writeHead(401); res.end('{"error":"Unauthorized"}'); return;
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
let ports, gateway, balanced;

async function startEnvoy(overrides = {}) {
  const env = { GATEWAY_PORT: '3003', USER_SERVICE_URL: `http://host.docker.internal:${ports[0]}`,
    SUPPLIER_SERVICE_URL: `http://host.docker.internal:${ports[1]}`,
    USER_SERVICE_JWKS_URL: `http://host.docker.internal:${ports[0]}/.well-known/jwks.json`, ...overrides };
  const args = ['run', '-d', '--entrypoint', '/bin/sh', '--label', 'foc.task=envoy-integration', '-p', '127.0.0.1::3003'];
  if (process.platform === 'linux') args.push('--add-host', 'host.docker.internal:host-gateway');
  for (const [name, value] of Object.entries(env)) args.push('-e', `${name}=${value}`);
  // One worker makes cache tests deterministic; production retains two workers.
  const id = docker(...args, 'foc-envoy:local', '-c',
    'python3 /opt/foc/render.py /tmp/foc-test.json && exec /usr/local/bin/envoy -c /tmp/foc-test.json --concurrency 1 --log-level warning');
  containers.push(id);
  const mapping = docker('port', id, '3003/tcp');
  const url = `http://${mapping.split('\n')[0]}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    // A connection accepted before Envoy listens can stall on Linux, so abandon each attempt after 1 s.
    try { if ((await fetch(url + '/health', { signal: AbortSignal.timeout(1000) })).status === 200) return url; } catch {}
    if (docker('inspect', id, '--format', '{{.State.Running}}') !== 'true') {
      throw new Error(`Envoy exited: ${docker('logs', id)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Envoy did not become ready');
}

before(async () => {
  ports = await Promise.all(servers.map(listen));
  gateway = await startEnvoy();
});
after(async () => {
  for (const id of containers) docker('rm', '-f', id);
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('health and public authentication keep their existing responses', async () => {
  for (const url of [gateway]) {
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
  for (const url of [gateway]) {
    for (const [method, path] of [['DELETE', '/locations'], ['GET', '/auth/login'],
      ['POST', '/auth/unknown'], ['GET', '/internal/users/123'], ['GET', '/locations/12/extra'],
      ['GET', '/users/123'], ['POST', '/admin/users']]) {
      const res = await fetch(url + path, { method });
      assert.equal(res.status, 404, `${method} ${path}`);
      assert.deepEqual(await res.json(), { error: 'Not found' });
    }
  }
});

test('stock JWT rejects malformed, modified, long-expired and missing-expiry tokens', async () => {
  const now = Math.floor(Date.now() / 1000);
  const modified = token().split('.');
  modified[2] = (modified[2][0] === 'A' ? 'B' : 'A') + modified[2].slice(1);
  for (const value of [undefined, 'invalid', modified.join('.'), token(old, { exp: now - 120 }),
    token(old, { nbf: now + 120 }), token(old, { exp: undefined })]) {
    const res = await fetch(gateway + '/locations', { headers: value ? { authorization: `Bearer ${value}` } : {} });
    assert.equal(res.status, 401);
    assert.match(res.headers.get('content-type'), /text\/plain/);
    assert.ok((await res.text()).length > 0);
  }
});

test('stock JWT applies default clock tolerance and permits missing kid', async () => {
  const now = Math.floor(Date.now() / 1000);
  for (const value of [token(old, { exp: now - 10 }), token(old, { nbf: now + 10 }),
    token(old, {}, { kid: undefined })]) {
    assert.equal((await fetch(gateway + '/locations', { headers: { authorization: `Bearer ${value}` } })).status, 200);
  }
});

test('RS256 and ES256 forward verified bearer, body, method and query', async () => {
  for (const url of [gateway]) {
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

test('headers are stripped; internal requests use stock ID handling', async () => {
  const res = await fetch(gateway + '/locations', { headers: { authorization: `Bearer ${token()}`,
    'x-user-id': 'forged', 'x-user-role': 'ADMIN', cookie: 'secret=value', 'x-request-id': 'trace-123' } });
  const data = await res.json();
  assert.equal(data.userId, undefined); assert.equal(data.userRole, undefined); assert.equal(data.cookie, undefined);
  assert.equal(data.requestId, 'trace-123');
  assert.equal(res.headers.get('x-request-id'), data.requestId);
  const unsafe = await fetch(gateway + '/health', { headers: { 'x-request-id': 'unsafe/id' } });
  assert.equal(unsafe.headers.get('x-request-id'), 'unsafe/id');
});

test('service authorization responses are preserved', async () => {
  for (const url of [gateway]) {
    const res = await fetch(url + '/locations', { headers: { authorization: `Bearer ${token()}`,
      'x-test-forbidden': 'yes' } });
    assert.equal(res.status, 403); assert.deepEqual(await res.json(), { error: 'Forbidden' });
  }
});

test('stock JWT does not refresh valid cached JWKS for an unknown key ID', async () => {
  keys = [old.jwk, ec.jwk];
  const url = await startEnvoy();
  const valid = token();
  const primed = await fetch(url + '/locations', { headers: { authorization: `Bearer ${valid}` } });
  assert.equal(primed.status, 200);
  await primed.text();
  keys = [rotated.jwk];
  try {
    const count = fetchCount;
    const res = await fetch(url + '/locations', { headers: { authorization: `Bearer ${token(rotated)}` } });
    assert.equal(res.status, 401);
    assert.equal(fetchCount, count);
  } finally { keys = [old.jwk, ec.jwk]; }
});

test('JWKS outages, malformed data and empty sets return 503 and recover', async () => {
  for (const mode of ['unavailable', 'malformed', 'missing-keys', 'bad-keys', 'empty']) {
    keyMode = mode === 'empty' ? 'ok' : mode;
    if (mode === 'empty') keys = [];
    try {
      const url = await startEnvoy();
      const res = await fetch(url + '/locations', { headers: { authorization: `Bearer ${token()}` } });
      assert.equal(res.status, 503);
      assert.match(res.headers.get('content-type'), /text\/plain/);
      await res.text();
      keyMode = 'ok'; keys = [old.jwk, ec.jwk];
      const recovered = await fetch(url + '/locations', { headers: { authorization: `Bearer ${token()}` } });
      assert.equal(recovered.status, 200, 'same session token works after JWKS recovery');
      await recovered.text();
    } finally { keyMode = 'ok'; keys = [old.jwk, ec.jwk]; }
  }
});

test('stock key selection accepts absent key IDs and does not enforce JWK use', async () => {
  for (const replacement of [{ ...old.jwk, use: 'enc' }, { ...old.jwk, kid: undefined }]) {
    keys = [replacement];
    try {
      const url = await startEnvoy();
      assert.equal((await fetch(url + '/locations', { headers: { authorization: `Bearer ${token()}` } })).status, 200);
    } finally { keys = [old.jwk, ec.jwk]; }
  }
});

test('optional issuer mismatch is 401 and audience mismatch is 403', async () => {
  const url = await startEnvoy({ GATEWAY_JWT_ISSUER: 'foc-test', GATEWAY_JWT_AUDIENCE: 'foc-browser' });
  for (const [claims, expected] of [[{ iss: 'other', aud: 'foc-browser' }, 401],
    [{ iss: 'foc-test', aud: 'other' }, 403]]) {
    const res = await fetch(url + '/locations', { headers: { authorization: `Bearer ${token(old, claims)}` } });
    assert.equal(res.status, expected);
  }
  assert.equal((await fetch(url + '/locations', { headers: { authorization: `Bearer ${token(old,
    { iss: 'foc-test', aud: ['other', 'foc-browser'] })}` } })).status, 200);
});

test('stock supports additional algorithms when the trusted JWK permits them', async () => {
  const rs384 = { ...old, alg: 'RS384' };
  keys = [{ ...old.jwk, alg: 'RS384' }];
  try {
    const url = await startEnvoy();
    const value = token(rs384);
    assert.equal((await fetch(url + '/locations', { headers: { authorization: `Bearer ${value}` } })).status, 200);
  } finally { keys = [old.jwk, ec.jwk]; }
});

test('stock rejects malformed registered JWT claim types', async () => {
  for (const claims of [{ iat: '123' }, { nbf: 'tomorrow' }, { sub: 123 }]) {
    const value = token(old, claims);
    assert.equal((await fetch(gateway + '/locations', { headers: { authorization: `Bearer ${value}` } })).status, 401);
  }
});

test('connection failure uses stock 503 text', async () => {
  const url = await startEnvoy({ SUPPLIER_SERVICE_URL: 'http://host.docker.internal:1' });
  const res = await fetch(url + '/locations', { headers: { authorization: `Bearer ${token()}` } });
  assert.equal(res.status, 503);
  assert.match(res.headers.get('content-type'), /text\/plain/);
});

test('non-origin-form request targets cannot redirect the proxy', async () => {
  for (const [path, expected] of [['http://example.com/locations', 404], ['//example.com/locations', 400]]) {
    const status = await new Promise((resolve, reject) => {
      const req = rawRequest(gateway, { path }, (res) => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(status, expected);
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

// Explicit contracts exercise both authenticated routing and anonymous rejection.
test('all protected User and Supplier routes enforce JWT and reach their service', async () => {
  const cases = [
    ['POST', '/auth/logout', 201], ['GET', '/users/me', 201], ['PATCH', '/users/me', 201],
    ['POST', '/users/me/otp', 201], ['POST', '/users/me/email', 201],
    ['POST', '/users/me/email/verify', 201], ['POST', '/users/me/password', 201],
    ['POST', '/users/me/deactivate', 201], ['PATCH', '/users/me/mobile', 201],
    ['GET', '/admin/users', 201], ['PATCH', '/admin/users/test-id/role', 201],
    ['POST', '/admin/users/test-id/reactivate', 201], ['POST', '/admin/users/test-id/suspend', 201],
    ['GET', '/location-types', 200],
    ['GET', '/locations', 200], ['POST', '/locations', 200], ['GET', '/locations/test-id', 200],
    ['PATCH', '/locations/test-id', 200], ['POST', '/locations/test-id/deactivate', 200],
    ['POST', '/locations/test-id/restore', 200],
  ];
  for (const [method, path, expected] of cases) {
    const anonymous = await fetch(gateway + path, { method });
    assert.equal(anonymous.status, 401, `${method} ${path} requires JWT`);
    await anonymous.text();
    const res = await fetch(gateway + path, { method, headers: { authorization: `Bearer ${token()}` } });
    assert.equal(res.status, expected, `${method} ${path}`);
    const data = await res.json();
    assert.equal(data.path, path);
    assert.equal(data.method, method);
    assert.equal(data.instance, expected === 201 ? 'user' : 'supplier-1');
  }
});

test('custom prefixes preserve public/protected routing and retire default paths', async () => {
  const url = await startEnvoy({ GATEWAY_AUTH_PREFIX: '/v2/auth', GATEWAY_LOCATIONS_PREFIX: '/v2/locations' });
  const publicRes = await fetch(url + '/v2/auth/login', { method: 'POST' });
  assert.equal(publicRes.status, 201);
  assert.equal((await publicRes.json()).path, '/v2/auth/login');
  assert.equal((await fetch(url + '/v2/locations')).status, 401);
  const res = await fetch(url + '/v2/locations/test-id', { headers: { authorization: `Bearer ${token()}` } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).path, '/v2/locations/test-id');
  assert.equal((await fetch(url + '/locations')).status, 404);
  assert.equal((await fetch(url + '/auth/login', { method: 'POST' })).status, 404);
});

test('upstream credential rejection remains 401 instead of verifier-unavailable', async () => {
  const res = await fetch(gateway + '/users/me', { headers: {
    authorization: `Bearer ${token()}`, 'x-test-unauthorized': 'yes' } });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'Unauthorized' });
});
