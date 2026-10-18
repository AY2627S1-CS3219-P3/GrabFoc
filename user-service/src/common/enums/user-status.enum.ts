/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from UserStatus in user-service/src/users/users.repository.ts (original disclosure: Claude Code, Claude Opus 5, 2026-09-26) as a TS enum.
 * Author review: Successfully reviewed by Deanson, 2026-10-16.
 */
// AI-generated (reviewed by Deanson)
/** Mirrors the `user_status` enum in db/migrations/001_init.sql. */
export enum UserStatus {
  ACTIVE = 'ACTIVE',
  DEACTIVATED = 'DEACTIVATED',
  SUSPENDED = 'SUSPENDED',
}
