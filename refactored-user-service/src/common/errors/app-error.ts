/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from user-service/src/common/app-error.ts (original disclosure: Claude Code, Claude Opus 5, 2026-09-25); added otpRejected(), shared by AuthService and UsersService.
 * Author review: Pending Deanson's review.
 */
// AI-generated (review pending: Deanson)
import { HttpException } from '@nestjs/common';
import { ErrorCode } from './error-codes';

/**
 * Throw this for every expected failure; ErrorFilter turns it into the response body.
 * `details` carries extras such as `{ attemptsRemaining: 2 }`. Never put an email, token or OTP in it.
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

/**
 * The error for a rejected OTP. A missing, expired and used-up code all answer OTP_EXPIRED,
 * so a caller cannot tell them apart.
 */
export function otpRejected(
  result: { status: 'INVALID'; attemptsRemaining: number } | { status: 'EXPIRED' },
): AppError {
  if (result.status === 'INVALID') {
    return new AppError(400, ErrorCode.OTP_INVALID, 'That code is not correct.', {
      attemptsRemaining: result.attemptsRemaining,
    });
  }
  return new AppError(400, ErrorCode.OTP_EXPIRED, 'That code has expired. Please request a new one.');
}
