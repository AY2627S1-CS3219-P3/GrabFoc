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
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-07
 * Scope: Added the cases for a replaced name generated from its own position rather than taken
 *        from caller text (PR #145 review).
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

/*
 * Three blocks stood here, covering the marker mechanism this file used to have: that an in-range
 * marker passed through untouched, that only its canonical spelling was recognised, and that its
 * index was bounded to three digits. All three tested bounds on what a caller could put *inside* a
 * replaced name, and the name is now generated from its own ordinal instead, so none of those
 * bounds exists to test. What they were really protecting - that no caller digits survive, that no
 * field is lost to a collision, and that a replaced name survives a later pass unchanged - is
 * asserted by the block below, which is why they are removed rather than rewritten
 * (PR #145 review).
 */

/**
 * Six attempts at bounding the numbers a caller could put inside a marker, and each bound was
 * defeated by a spelling the previous one allowed: the length field, the fixed point, the suffix,
 * the numeric limit, leading zeroes, the index range. `[key 12: 34 chars]` carries four digits and
 * `[key 123: 456 chars]` six, and both satisfy every bound that only checks ranges (PR #145).
 *
 * So no caller text is trusted at all now. A replaced name is generated from its ordinal among the
 * replacements in that object - `[key 1]`, `[key 2]` - which no caller can influence, cannot
 * collide (a kept key can never contain a bracket), and is a fixed point by construction: on a
 * later pass the same key is the same ordinal and gets the same name.
 */
describe('a replaced name generated rather than trusted', () => {
  const GENERATED = /^\[key [1-9]\d*\]$/;

  const metaOf = (meta: Record<string, unknown>) => {
    shipper().emit({ level: 'info', event: 'probe', meta });
    return (JSON.parse(written[written.length - 1]) as { meta: Record<string, unknown> }).meta;
  };

  it.each(['[key 12: 34 chars]', '[key 123: 456 chars]', '[key 0: 000123 chars]', '[key 999: 1 chars]'])(
    'carries none of the digits in %s',
    (key) => {
      const keys = Object.keys(metaOf({ [key]: 1 }));
      expect(keys).toHaveLength(1);
      expect(keys[0]).toMatch(GENERATED);
      expect(keys[0]).toBe('[key 1]');
    },
  );

  it('numbers the replacements in order and loses no field', () => {
    const meta = metaOf({ '@one': 1, kept: 2, '#two': 3 });
    expect(Object.keys(meta)).toEqual(['[key 1]', 'kept', '[key 2]']);
    expect(Object.values(meta)).toEqual([1, 2, 3]);
  });

  it('is a fixed point: a generated name ships again unchanged', () => {
    // What the store sees on its own pass over the same object.
    expect(Object.keys(metaOf({ '[key 1]': 1, kept: 2, '[key 2]': 3 }))).toEqual([
      '[key 1]',
      'kept',
      '[key 2]',
    ]);
  });

  it('still keeps ordinary names, including the ones redaction blanks', () => {
    const meta = metaOf({ requestId: 'r-1', 'req.path': '/x', password: 'hunter2' });
    expect(Object.keys(meta)).toEqual(['requestId', 'req.path', 'password']);
    expect(meta.password).toBe('[REDACTED]');
  });

  it('still replaces a name that carries data, and shows none of it', () => {
    const keys = Object.keys(metaOf({ 'alice@nus.edu.sg': 1 }));
    expect(keys).toEqual(['[key 1]']);
  });
});
