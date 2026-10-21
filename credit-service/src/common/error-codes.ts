/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: The machine-readable error codes listed in the redesign spec §4.5.
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Added the dead-letter codes (spec §9.2).
 * Author review: pending — Jian Bing to record what he checked.
 */

/** Sent as `code` in Problem Details bodies, so callers needn't parse `detail`. */
export const ErrorCode = {
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  WALLET_NOT_FOUND: 'WALLET_NOT_FOUND',
  HOLD_MISMATCH: 'HOLD_MISMATCH',
  ALREADY_TRANSFERRED: 'ALREADY_TRANSFERRED',
  ALREADY_RELEASED: 'ALREADY_RELEASED',
  COURIER_IS_REQUESTER: 'COURIER_IS_REQUESTER',
  HOLD_NOT_FOUND: 'HOLD_NOT_FOUND',
  DEAD_LETTER_NOT_FOUND: 'DEAD_LETTER_NOT_FOUND',
  ALREADY_REPLAYED: 'ALREADY_REPLAYED',
  NOT_REPLAYABLE: 'NOT_REPLAYABLE',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
