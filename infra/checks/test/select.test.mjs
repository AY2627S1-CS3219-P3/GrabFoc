/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-05
 * Scope: Tests which Postman requests the staging checks run (deploy part 3, #143).
 * Author review (Jian Bing, 2026-11-09): Looked through the code and think it's okay; watched the staging dry run pass (deploy, checks, and the fixes it needed).
 */
// AI-generated (Claude Code).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FOLDERS, select } from '../select.mjs';

const collection = JSON.parse(
  readFileSync(new URL('../../../api-gateway/postman/gateway.postman_collection.json', import.meta.url)),
);
const urls = { baseUrl: 'https://site.example/gateway', mailpitUrl: 'http://172.17.0.1:8025' };

const folderPaths = (items, prefix = '') =>
  items.flatMap((i) => {
    if (!i.item) return [];
    const path = prefix + i.name;
    return i.item.some((c) => c.item) ? folderPaths(i.item, `${path}/`) : [path];
  });
const requests = (items) => items.flatMap((i) => (i.item ? requests(i.item) : [i]));

test('keeps the chosen folders in collection order', () => {
  assert.deepEqual(folderPaths(select(collection, FOLDERS, urls).item), [
    'Gateway smoke checks',
    'User Service/Public',
    'User Service/Sign-up',
    'User Service/Session',
    'User Service/Errors',
    'Supplier Service/Read',
    'Supplier Service/Errors',
  ]);
});

test('no admin credentials or password reset', () => {
  const kept = requests(select(collection, FOLDERS, urls).item);
  assert.ok(kept.length > 30, `only ${kept.length} requests kept`);
  for (const request of kept) {
    assert.doesNotMatch(JSON.stringify(request), /adminAccessToken|adminPassword|adminEmail|\/admin\/|password\/reset/);
  }
});

test('a request that needs admin is dropped from a chosen folder, and its neighbours stay', () => {
  const names = requests(select(collection, FOLDERS, urls).item).map((r) => r.name);
  assert.ok(!names.includes('Admin: include inactive'));
  assert.ok(names.includes('403 USER asks for inactive'));
});

test('a password-reset request added to a chosen folder later is dropped too', () => {
  const drifted = structuredClone(collection);
  drifted.item.find((i) => i.name === 'Gateway smoke checks').item.push({
    name: 'New reset check',
    request: { method: 'POST', url: '{{baseUrl}}/auth/password/reset' },
  });
  const names = requests(select(drifted, FOLDERS, urls).item).map((r) => r.name);
  assert.ok(!names.includes('New reset check'));
});

test('an unknown folder path throws', () => {
  assert.throws(() => select(collection, ['User Service/Nope'], urls), /User Service\/Nope/);
});

test("sets the collection's own URL variables, which the scripts read directly", () => {
  const variables = select(collection, FOLDERS, urls).variable;
  assert.equal(variables.find((v) => v.key === 'baseUrl').value, urls.baseUrl);
  assert.equal(variables.find((v) => v.key === 'mailpitUrl').value, urls.mailpitUrl);
});
