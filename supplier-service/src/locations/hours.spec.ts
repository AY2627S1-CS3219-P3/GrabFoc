/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-30
 * Scope: Generated these unit tests for the HHMMhrs <-> minutes conversion.
 * Author review (Jian Bing): Ran `npm test` on 2026-10-01 (157 passed) and verified each test
 *        case in this file by hand.
 */
import { HHMM_RE, hhmmToMinutes, minutesToHhmm } from './hours';

describe('hhmmToMinutes', () => {
  it.each([
    ['0000hrs', 0],
    ['0001hrs', 1],
    ['0930hrs', 570],
    ['1200hrs', 720],
    ['2359hrs', 1439],
  ])('converts %s to %i minutes after midnight', (value, minutes) => {
    expect(hhmmToMinutes(value)).toBe(minutes);
  });

  it('throws on a value that is not HHMMhrs', () => {
    expect(() => hhmmToMinutes('9:30')).toThrow('Not in HHMMhrs format');
  });
});

describe('minutesToHhmm', () => {
  it.each([
    [0, '0000hrs'],
    [5, '0005hrs'],
    [570, '0930hrs'],
    [1439, '2359hrs'],
  ])('converts %i minutes to %s, zero-padded', (minutes, value) => {
    expect(minutesToHhmm(minutes)).toBe(value);
  });
});

describe('HHMM_RE', () => {
  it.each(['0000hrs', '0959hrs', '1959hrs', '2300hrs', '2359hrs'])('accepts %s', (value) => {
    expect(HHMM_RE.test(value)).toBe(true);
  });

  it.each([
    ['2400hrs', 'hour 24'],
    ['2560hrs', 'hour 25'],
    ['0960hrs', 'minute 60'],
    ['930hrs', 'a missing leading zero'],
    ['0930', 'a missing "hrs" suffix'],
    ['0930HRS', 'an upper-case suffix'],
    [' 0930hrs', 'leading whitespace'],
    ['0930hrs ', 'trailing whitespace'],
  ])('rejects %s (%s)', (value) => {
    expect(HHMM_RE.test(value)).toBe(false);
  });
});
