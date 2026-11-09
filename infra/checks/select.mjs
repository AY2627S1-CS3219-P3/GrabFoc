/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-05
 * Scope: Generated from the deployment plan (deploy part 3, #143, Task 2).
 * Author review (Jian Bing, 2026-11-09): Looked through the code and think it's okay; watched the staging dry run pass (deploy, checks, and the fixes it needed).
 *
 * Cuts the gateway Postman collection down to what is safe on staging: the folders below, minus any
 * request that needs an admin or resets a password. Those stay out however the collection changes.
 *   node select.mjs <collection in> <collection out> <base URL> <Mailpit URL>
 */
// AI-generated (Claude Code).
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const FOLDERS = [
  'Gateway smoke checks',
  'User Service/Public',
  'User Service/Sign-up',
  'User Service/Session',
  'User Service/Errors',
  'Supplier Service/Read',
  'Supplier Service/Errors',
];

const NOT_ON_STAGING = /adminAccessToken|adminPassword|adminEmail|\/admin\/|password\/reset/;

function keep(items, wanted, found, prefix = '') {
  return items.flatMap((item) => {
    if (!item.item) return [];
    const path = prefix + item.name;
    if (wanted.includes(path)) {
      found.add(path);
      return [{ ...item, item: item.item.filter((r) => !NOT_ON_STAGING.test(JSON.stringify(r))) }];
    }
    const children = keep(item.item, wanted, found, `${path}/`);
    return children.length > 0 ? [{ ...item, item: children }] : [];
  });
}

/** The chosen folders, with the URLs the requests and their scripts read. */
export function select(collection, paths, { baseUrl, mailpitUrl }) {
  const found = new Set();
  const item = keep(collection.item, paths, found);
  const missing = paths.filter((p) => !found.has(p));
  if (missing.length > 0) {
    throw new Error(`Not in the collection: ${missing.join(', ')}`);
  }
  // Collection variables, not --env-var: the scripts call pm.collectionVariables.get('baseUrl').
  const urls = { baseUrl, mailpitUrl };
  const variable = collection.variable.map((v) => (v.key in urls ? { ...v, value: urls[v.key] } : v));
  return { ...collection, item, variable };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output, baseUrl, mailpitUrl] = process.argv.slice(2);
  const collection = JSON.parse(readFileSync(input, 'utf8'));
  writeFileSync(output, JSON.stringify(select(collection, FOLDERS, { baseUrl, mailpitUrl })));
}
