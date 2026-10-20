/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated the timing-window checks and the pickup-hours overlap rule (Phase B).
 * Author review: Reviewed.
 */
import { AppError, ErrorCode } from '../common/errors';
import type { Location } from '../integrations/supplier.client';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** Supplier hours are campus time; Singapore is UTC+8 with no daylight saving. */
const CAMPUS_OFFSET_MS = 8 * 60 * MINUTE_MS;

export interface Window {
  windowStart: Date;
  windowEnd: Date;
}

const invalid = (field: string, message: string) =>
  new AppError(400, ErrorCode.VALIDATION_ERROR, message, { fields: [{ field, message }] });

/** Omitted start = now; omitted end = start + 24 hours. */
export function defaultWindow(start: Date | undefined, end: Date | undefined, now = new Date()): Window {
  const windowStart = start ?? now;
  return { windowStart, windowEnd: end ?? new Date(windowStart.getTime() + DAY_MS) };
}

/** The window must run forwards and not have ended already. A future start is allowed. */
export function assertValidWindow({ windowStart, windowEnd }: Window, now = new Date()): void {
  if (windowEnd <= windowStart) throw invalid('windowEnd', 'windowEnd must be after windowStart.');
  if (windowEnd <= now) throw invalid('windowEnd', 'The timing window has already ended.');
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(2, 4));

/**
 * True when the window overlaps at least one opening interval. No hours = always open;
 * a closing time at or before the opening time closes after midnight.
 */
export function overlapsOpeningHours({ windowStart, windowEnd }: Window, openTime: string | null, closeTime: string | null): boolean {
  if (!openTime || !closeTime) return true;
  const open = minutes(openTime);
  const openFor = ((minutes(closeTime) - open + 1440) % 1440 || 1440) * MINUTE_MS; // equal times = 24 hours
  const start = windowStart.getTime();
  const end = windowEnd.getTime();
  if (end - start >= DAY_MS) return true; // every day has an opening

  // From the campus midnight before the window's first day, so last night's late opening is included.
  let day = Math.floor((start + CAMPUS_OFFSET_MS) / DAY_MS) * DAY_MS - CAMPUS_OFFSET_MS - DAY_MS;
  for (; day < end; day += DAY_MS) {
    const opens = day + open * MINUTE_MS;
    if (opens < end && opens + openFor > start) return true;
  }
  return false;
}

export function assertPickupOpen(window: Window, pickup: Location): void {
  if (!overlapsOpeningHours(window, pickup.openTime, pickup.closeTime)) {
    throw new AppError(
      400,
      ErrorCode.PICKUP_CLOSED,
      `The timing window does not overlap ${pickup.name}'s opening hours (${pickup.openTime}–${pickup.closeTime}).`,
    );
  }
}
