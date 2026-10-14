/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
 * Scope: Copied the Problem Details (RFC 9457) error type and filter from
 *        supplier-service/src/common/problem.ts, so both services send errors in the same shape.
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Added the optional machine-readable `code` (redesign spec §4.5).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'http';
import type { ErrorCode } from './error-codes';

/** Throw this to send a Problem Details response with the given status, detail and optional code. */
export class ProblemException extends HttpException {
  constructor(status: number, detail: string, readonly code?: ErrorCode) {
    super({ detail, message: detail, code }, status);
  }
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    let status = 500;
    let detail = 'An unexpected error occurred.';
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body && 'detail' in body) {
        detail = String((body as { detail: unknown }).detail);
        const given = (body as { code?: unknown }).code;
        if (typeof given === 'string') code = given;
      } else {
        detail = exception.message;
      }
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    res
      .status(status)
      .type('application/problem+json')
      .json({
        type: 'about:blank',
        title: STATUS_CODES[status] ?? 'Error',
        status,
        detail,
        ...(code ? { code } : {}),
        instance: req.originalUrl,
      });
  }
}
