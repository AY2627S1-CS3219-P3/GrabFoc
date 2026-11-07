/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-07
 * Scope: A standalone spec for this service's copy of the shipper. The copy's behaviour has been
 *        covered by the canonical spec in the Logging Service, which is on another branch - so a
 *        fix that lands only here had no test here. This covers the collision-name range
 *        (PR #157 review).
 * Author review: Cole Lin, read and approved.
 */
import { LogShipper } from './log-shipper';

const written: string[] = [];
const lineId = '00000000-0000-4000-8000-000000000001';

function shipper(): LogShipper {
  return new LogShipper({
    service: 'supplier',
    write: (line) => written.push(line),
    newId: () => lineId,
  });
}

beforeEach(() => {
  written.length = 0;
});

/**
 * A replaced key is recognised on a later pass only when its numbers are ones that walk could have
 * written - an index inside the object's own key range. The collision loop walked `n` upwards from
 * the key's index, so with three keys it could emit `[key 3: 16 chars]`: out of range, therefore
 * replaced again by the Logging Service's own pass, and the stored row stopped matching the line on
 * stdout. That is the disagreement the fixed point exists to prevent, reintroduced by the fix for
 * the previous version of it (PR #157 review).
 */
describe('a collision name and the range the next pass recognises', () => {
  const MARKER = /^\[key (\d+): (\d+) chars\]$/;

  /**
   * The exact shape that collides: `@` is outside the safe alphabet and becomes
   * `[key 0: 1 chars]`, the second key is a marker whose numbers are in range and so passes
   * through, and the third is spelled exactly like what `@` became.
   */
  const colliding = { '@': 1, '[key 2: 16 chars]': 2, '[key 0: 1 chars]': 3 };

  const metaOf = (meta: Record<string, unknown>) => {
    shipper().emit({ level: 'info', event: 'probe', meta });
    return (JSON.parse(written[written.length - 1]) as { meta: Record<string, unknown> }).meta;
  };

  it('keeps every marker index inside the object key count', () => {
    const meta = metaOf(colliding);
    const keys = Object.keys(meta);
    expect(keys).toHaveLength(3);
    for (const key of keys) {
      const parts = MARKER.exec(key);
      if (parts) expect(Number(parts[1])).toBeLessThan(keys.length);
    }
  });

  it('loses no field to the collision', () => {
    expect(Object.values(metaOf(colliding)).sort()).toEqual([1, 2, 3]);
  });

  it('still passes an in-range marker through untouched', () => {
    const meta = metaOf({ '[key 0: 16 chars]': 1, other: 2 });
    expect(Object.keys(meta)).toContain('[key 0: 16 chars]');
  });

  it('still replaces a marker whose numbers it could not have written', () => {
    const keys = Object.keys(metaOf({ '[key 123456: 6 chars]': 1 }));
    expect(keys[0]).not.toContain('123456');
  });
});
