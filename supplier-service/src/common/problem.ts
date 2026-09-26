/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-22
 * Scope: Generated the Problem Details (RFC 9457) error type and global exception filter,
 *        following the team's error-response decisions in supplier-service/AGENTS.md.
 * Author review: pending — to be completed by the reviewing team member.
 */
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'http';

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
        instance: req.originalUrl,
      });
  }
}
