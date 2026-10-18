/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated the error type, codes and global filter, following user-service/src/common
 *        (same `{ error: { code, message, details } }` envelope and 401/403 audit line).
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Added the Phase B error codes.
 * Author review: Reviewed in full
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Added CONFIRMATION_PENDING (Phase C).
 * Author review: Reviewed
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Added SERVICE_KEY_INVALID for the /internal routes (Phase D).
 * Author review: Reviewed
 */
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

/** Machine-readable codes; clients switch on these, never on the message. */
export const ErrorCode = {
  // 400
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PICKUP_CLOSED: 'PICKUP_CLOSED',
  // 401 / 403 / 404
  TOKEN_INVALID: 'TOKEN_INVALID',
  SERVICE_KEY_INVALID: 'SERVICE_KEY_INVALID',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  // 409
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  INVALID_STATE: 'INVALID_STATE',
  COURIER_BUSY: 'COURIER_BUSY',
  LOCATION_INACTIVE: 'LOCATION_INACTIVE',
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  CONFIRMATION_PENDING: 'CONFIRMATION_PENDING',
  // 500 / 503
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Throw for every expected failure; never put tokens or personal data in `details`. */
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

/** Code for an HttpException Nest throws itself, e.g. an unmatched route. */
function codeForStatus(status: number): ErrorCode {
  const codes: Record<number, ErrorCode> = {
    400: ErrorCode.VALIDATION_ERROR,
    401: ErrorCode.TOKEN_INVALID,
    403: ErrorCode.FORBIDDEN,
    404: ErrorCode.NOT_FOUND,
    503: ErrorCode.SERVICE_UNAVAILABLE,
  };
  return codes[status] ?? ErrorCode.INTERNAL_ERROR;
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');
  private readonly access = new Logger('Access');

  catch(exception: unknown, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<Request & { caller?: { id: string } }>();
    const res = host.switchToHttp().getResponse<Response>();

    let status = 500;
    let code: ErrorCode = ErrorCode.INTERNAL_ERROR;
    let message = 'An unexpected error occurred.';
    let details: Record<string, unknown> | undefined;
    if (exception instanceof AppError) {
      ({ code, message, details } = exception);
      status = exception.getStatus();
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = codeForStatus(status);
      message = exception.message;
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    // One structured line per denial (root AGENTS.md §8). req.path, not originalUrl, keeps query strings out.
    if (status === 401 || status === 403) {
      this.access.warn(
        JSON.stringify({
          event: 'UNAUTHORISED_ACCESS',
          timestamp: new Date().toISOString(),
          status,
          code,
          method: req.method,
          path: req.path,
          userId: req.caller?.id ?? null,
        }),
      );
    }

    res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
  }
}
