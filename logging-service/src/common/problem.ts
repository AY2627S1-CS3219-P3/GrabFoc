/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Copied from supplier-service/src/common/problem.ts, so errors from this service have the
 *        same Problem Details shape as every other one.
 * Author review: pending — Cole Lin to record what he checked.
 */
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'http';
import { logPath, requestIdOf } from './request-id';

/** Throw this to send a Problem Details response with the given status and detail text. */
export class ProblemException extends HttpException {
  constructor(status: number, detail: string) {
    super({ detail, message: detail }, status);
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

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body && 'detail' in body) {
        detail = String((body as { detail: unknown }).detail);
      } else {
        detail = exception.message;
      }
    }

    // Every 500 gets a line, whether it arrived as an HttpException or not. The stack goes in
    // Nest's own stack argument, not in the JSON: a failure message can carry whatever it touched
    // (a connection string, say), and a central log store that anyone can query is the last place
    // that should hold it.
    if (status === 500) {
      this.logger.error(
        JSON.stringify({
          event: 'unhandled_error',
          requestId: requestIdOf(req),
          method: req.method,
          path: logPath(req),
        }),
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res
      .status(status)
      .type('application/problem+json')
      .json({
        type: 'about:blank',
        title: STATUS_CODES[status] ?? 'Error',
        status,
        detail,
        instance: req.originalUrl,
      });
  }
}
