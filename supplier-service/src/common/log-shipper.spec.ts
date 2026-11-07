/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-07
 * Scope: A standalone spec for this service's copy of the shipper. The copy's behaviour has been
 *        covered by the canonical spec in the Logging Service, which is on another branch - so a
 *        fix that lands only here had no test here. This covers the collision-name range
 *        (PR #157 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-07
 * Scope: Added the cases for a marker spelled with leading zeroes (PR #157 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-07
 * Scope: Added the case for an in-range index still carrying four digits (PR #157 review).
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

/**
 * `Number('000123')` is 123, so a six-digit spelling satisfied the three-digit bound and the
 * caller's digits went through - an OTP padded with zeroes, straight past the fix that was added
 * to stop exactly that. A marker's numbers have to be spelled the way this code spells them
 * (PR #157 review).
 */
describe('a marker spelled with leading zeroes', () => {
  const keysOf = (meta: Record<string, unknown>) => {
    shipper().emit({ level: 'info', event: 'probe', meta });
    return Object.keys((JSON.parse(written[written.length - 1]) as { meta: object }).meta);
  };

  it.each(['[key 0: 000123 chars]', '[key 00: 16 chars]', '[key 0: 0999 chars]'])(
    'replaces %s, which this code would never have written',
    (key) => {
      const keys = keysOf({ [key]: 1 });
      expect(keys[0]).not.toBe(key);
      expect(keys[0]).not.toContain('000');
    },
  );

  it('still passes the canonical spelling through', () => {
    expect(keysOf({ '[key 0: 16 chars]': 1, other: 2 })).toContain('[key 0: 16 chars]');
  });

  it('still passes a zero length through, which is canonical', () => {
    expect(keysOf({ '[key 0: 0 chars]': 1, other: 2 })).toContain('[key 0: 0 chars]');
  });
});

/**
 * Restricting the index to the object's own key range still left four and five digits available,
 * because an object may legitimately hold thousands of fields: with 1,235 of them,
 * `[key 1234: 1 chars]` is in range and passed through with a four-digit code in the index slot.
 * The index is bounded to three digits now, the same width `MAX_UNNAMED_KEY` already uses and for
 * the same reason - three digits cannot hold a code this product issues (PR #157 review).
 */
describe('an in-range index that still carries four digits', () => {
  const bigMetaWith = (key: string) => {
    const meta: Record<string, unknown> = { [key]: 'secret' };
    for (let i = 0; i < 1300; i += 1) meta[`f${i}`] = i;
    shipper().emit({ level: 'info', event: 'probe', meta });
    return Object.keys((JSON.parse(written[written.length - 1]) as { meta: object }).meta);
  };

  it.each(['[key 1234: 1 chars]', '[key 99999: 1 chars]'])('replaces %s even in a large object', (key) => {
    const keys = bigMetaWith(key);
    expect(keys).not.toContain(key);
    // Checked on the marker-shaped names only. The filler fields are called `f0`...`f1299`, so
    // searching every key for the digits matches `f1234` and says nothing - which is what the
    // first version of this assertion did.
    const markers = keys.filter((k) => k.startsWith('[key '));
    expect(markers).not.toHaveLength(0);
    for (const marker of markers) {
      expect(marker).toMatch(/^\[key (0|[1-9]\d{0,2}): (0|[1-9]\d{0,2}) chars\]$/);
    }
  });

  it('still passes a three-digit index through', () => {
    expect(bigMetaWith('[key 999: 1 chars]')).toContain('[key 999: 1 chars]');
  });
});
