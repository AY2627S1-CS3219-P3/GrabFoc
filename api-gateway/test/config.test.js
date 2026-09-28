/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Verified gateway-local .env loading and shell-variable precedence.
Author review: Pending gateway owner review.
*/
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadRuntimeEnv } from '../dist/config.js';

// AI-generated (pending human review)
test('loads .env values without overriding shell variables', () => {
  const path = join(tmpdir(), `gateway-config-${randomUUID()}.env`);
  const previous = {
    userServiceUrl: process.env.USER_SERVICE_URL,
    gatewayPort: process.env.GATEWAY_PORT,
  };
  delete process.env.USER_SERVICE_URL;
  process.env.GATEWAY_PORT = '4001';
  writeFileSync(path, 'USER_SERVICE_URL=http://localhost:3001\nGATEWAY_PORT=4002\n');
  try {
    const env = loadRuntimeEnv(path);
    assert.equal(env.USER_SERVICE_URL, 'http://localhost:3001');
    assert.equal(env.GATEWAY_PORT, '4001');
  } finally {
    unlinkSync(path);
    for (const [key, value] of [
      ['USER_SERVICE_URL', previous.userServiceUrl],
      ['GATEWAY_PORT', previous.gatewayPort],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('missing optional .env file does not prevent startup', () => {
  assert.doesNotThrow(() => loadRuntimeEnv(join(tmpdir(), `missing-gateway-config-${randomUUID()}.env`)));
});
