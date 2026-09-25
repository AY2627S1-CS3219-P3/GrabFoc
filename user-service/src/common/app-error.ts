/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated the application error type carrying a machine-readable code.
 * Author review: Read in full; verified the service starts, migrates and serves /health under docker compose.
 */
import { HttpException } from '@nestjs/common';
import { ErrorCode } from './error-codes';

/**
 * Throw this for every expected failure. `ErrorFilter` turns it into the response body.
 *
 *   throw new AppError(409, ErrorCode.EMAIL_TAKEN, 'An account with this email already exists.');
 *
 * `details` carries the extras the frontend needs, e.g. `{ attemptsRemaining: 2 }` or
 * `{ retryAfterSeconds: 840 }`. Never put an email address, a token or an OTP in it.
 */
export class AppError extends HttpException {
  constructor(
    status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super({ code, message, details }, status);
  }
}
