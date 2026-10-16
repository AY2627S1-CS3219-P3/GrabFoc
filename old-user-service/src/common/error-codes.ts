/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Transcribed the error codes from the "Errors" table in user-service/AGENTS.md.
 * Author review: Read in full; verified the service starts, migrates and serves /health under docker compose.
 */

/**
 * The single list of machine-readable error codes. The frontend switches on these, never on
 * the human-readable message, so a code is part of the API contract: renaming one is a
 * breaking change. Keep in sync with the "Errors" table in AGENTS.md.
 */
export const ErrorCode = {
  // 400
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  // 401
  TOKEN_INVALID: 'TOKEN_INVALID',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  // 403
  FORBIDDEN: 'FORBIDDEN',
  ACCOUNT_DEACTIVATED: 'ACCOUNT_DEACTIVATED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  // 404
  NOT_FOUND: 'NOT_FOUND',
  // 409
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  LAST_ADMIN: 'LAST_ADMIN',
  CANNOT_MODIFY_SELF: 'CANNOT_MODIFY_SELF',
  USER_NOT_ACTIVE: 'USER_NOT_ACTIVE',
  NOT_DEACTIVATED: 'NOT_DEACTIVATED',
  // 423
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  // 429
  RATE_LIMITED: 'RATE_LIMITED',
  // 500 / 503
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Fallback code for a status thrown by Nest itself (e.g. the router's own 404). */
export function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return ErrorCode.VALIDATION_ERROR;
    case 401:
      return ErrorCode.TOKEN_INVALID;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 503:
      return ErrorCode.SERVICE_UNAVAILABLE;
    default:
      return ErrorCode.INTERNAL_ERROR;
  }
}
