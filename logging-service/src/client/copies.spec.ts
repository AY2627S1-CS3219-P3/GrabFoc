/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Enforces the one rule the copied shipper depends on - that every service's copy has the
 *        same body as this canonical file. It had been enforced by hand, and a copy fell a round
 *        behind its canonical at least once (issue #52).
 * Author review: Cole Lin, read and approved.
 */
import { readFileSync } from 'fs';
import * as path from 'path';

// AI-generated (reviewed by Cole Lin).

const REPO = path.resolve(__dirname, '../../..');

/**
 * Every copy of the shipper. This repository has no shared package, so common code is copied
 * rather than imported, and the file says a change here has to be repeated there - which is a rule
 * nothing checked. Keeping it by hand went wrong: one copy was a round behind its own canonical,
 * so a line on stdout and the row in the store disagreed about a field name.
 *
 * A service wiring itself to the Logging Service adds its path here.
 */
const COPIES = [
  'supplier-service/src/common/log-shipper.ts',
  'user-service/src/common/log-shipper.ts',
  'credit-service/src/common/log-shipper.ts',
  'order-service/src/common/log-shipper.ts',
];

/**
 * Everything after the leading disclosure comment. The headers *should* differ - each records what
 * that copy was made for and who reviewed it - so comparing whole files would fail for the wrong
 * reason and teach everyone to ignore this test.
 */
function body(relative: string): string {
  const text = readFileSync(path.join(REPO, relative), 'utf8').replace(/\r\n/g, '\n');
  const end = text.indexOf(' */\n');
  expect(end).toBeGreaterThan(0);
  return text.slice(end + ' */\n'.length);
}

const canonical = body('logging-service/src/client/log-shipper.ts');

it.each(COPIES)('%s has the same body as the canonical shipper', (copy) => {
  // On a failure: copy logging-service/src/client/log-shipper.ts over it, keep that file's own
  // disclosure header, and add an entry saying what the change was.
  expect(body(copy)).toBe(canonical);
});

it('names a copy for every service that has one, so a new copy cannot be left out', () => {
  // The list above is hand-written, so the check is only as good as it is. This catches the case
  // it would otherwise miss: a service that grew a copy and was never added here.
  const { globSync } = require('fs') as { globSync?: (p: string, o: object) => string[] };
  if (!globSync) return; // Node < 22: the list above is still checked, just not its completeness.
  const found = globSync('*/src/common/log-shipper.ts', { cwd: REPO })
    .map((p: string) => p.replace(/\\/g, '/'))
    .sort();
  expect(found).toEqual([...COPIES].sort());
});
