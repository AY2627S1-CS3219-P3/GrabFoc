/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-22
 * Scope: Generated HHMMhrs <-> minutes-since-midnight conversion (team decision: stored as minutes,
 *        entered and searched as HHMMhrs).
 * Author review: pending — to be completed by the reviewing team member.
 */

export const HHMM_RE = /^([01]\d|2[0-3])([0-5]\d)hrs$/;

/** "0900hrs" -> 540. Assumes the value already matched HHMM_RE. */
export function hhmmToMinutes(value: string): number {
  const m = HHMM_RE.exec(value);
  if (!m) throw new Error(`Not in HHMMhrs format: ${value}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 540 -> "0900hrs" */
export function minutesToHhmm(minutes: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(minutes / 60))}${pad(minutes % 60)}hrs`;
}
