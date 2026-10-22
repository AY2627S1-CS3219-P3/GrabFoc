/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated unit tests for timing-window defaults/validation and pickup-hours overlap.
 * Author review: Reviewed.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AppError } from '../common/errors';
import { assertValidWindow, defaultWindow, overlapsOpeningHours } from './timing';

/** A window in campus time (UTC+8), e.g. sgt('2030-01-01T10:00', '2030-01-01T11:00'). */
const sgt = (start: string, end: string) => ({
  windowStart: new Date(`${start}:00+08:00`),
  windowEnd: new Date(`${end}:00+08:00`),
});

test('defaultWindow starts now and lasts 24 hours unless given', () => {
  const now = new Date('2030-01-01T00:00:00Z');
  assert.deepEqual(defaultWindow(undefined, undefined, now), {
    windowStart: now,
    windowEnd: new Date('2030-01-02T00:00:00Z'),
  });
  const start = new Date('2030-01-05T00:00:00Z');
  assert.equal(defaultWindow(start, undefined, now).windowEnd.toISOString(), '2030-01-06T00:00:00.000Z');
});

test('assertValidWindow rejects backwards and already-ended windows, allows a future start', () => {
  const now = new Date('2030-01-01T12:00:00+08:00');
  const rejects = (window: ReturnType<typeof sgt>) =>
    assert.throws(() => assertValidWindow(window, now), (e) => e instanceof AppError && e.getStatus() === 400);
  rejects(sgt('2030-01-02T10:00', '2030-01-02T09:00'));
  rejects(sgt('2030-01-01T09:00', '2030-01-01T11:00'));
  assertValidWindow(sgt('2030-01-02T09:00', '2030-01-02T10:00'), now);
});

test('daytime hours: overlap counts, touching or outside does not', () => {
  const open = (start: string, end: string) => overlapsOpeningHours(sgt(start, end), '0900hrs', '1700hrs');
  assert.equal(open('2030-01-01T16:30', '2030-01-01T18:00'), true);
  assert.equal(open('2030-01-01T07:00', '2030-01-01T09:00'), false);
  assert.equal(open('2030-01-01T17:00', '2030-01-01T23:00'), false);
  assert.equal(open('2030-01-01T18:00', '2030-01-02T08:00'), false);
  assert.equal(open('2030-01-01T18:00', '2030-01-02T09:30'), true); // next morning
});

test('overnight hours include the part after midnight', () => {
  const open = (start: string, end: string) => overlapsOpeningHours(sgt(start, end), '2200hrs', '0200hrs');
  assert.equal(open('2030-01-01T00:30', '2030-01-01T01:00'), true); // previous night's opening
  assert.equal(open('2030-01-01T23:00', '2030-01-01T23:30'), true);
  assert.equal(open('2030-01-01T03:00', '2030-01-01T21:00'), false);
});

test('no hours, equal open/close times and windows of 24 hours or more always overlap', () => {
  const short = sgt('2030-01-01T03:00', '2030-01-01T04:00');
  assert.equal(overlapsOpeningHours(short, null, null), true);
  assert.equal(overlapsOpeningHours(short, '0800hrs', '0800hrs'), true);
  assert.equal(overlapsOpeningHours(sgt('2030-01-01T18:00', '2030-01-02T18:00'), '0900hrs', '0901hrs'), true);
});
