/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated the global exception filter, the response envelope and the
 *        UNAUTHORISED_ACCESS logging required by U5.1.1 / U5.2.2.
 * Author review: Read in full; verified the service starts, migrates and serves /health under docker compose.
 */
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError } from './app-error';
import { ErrorCode, codeForStatus } from './error-codes';
import { AuditEvent, auditLine } from './logger';

interface ErrorShape {
  status: number;
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * The response envelope.
 *
 * NOTE [Open]: the body format is not settled across services. The Supplier Service returns
 * RFC 9457 Problem Details (`application/problem+json`); this is the shape from our own plan.
 * See the "Open" section of AGENTS.md. Everything that builds a body goes through this one
 * function, so switching envelopes is a change here and nowhere else.
 */
function toErrorBody(error: ErrorShape): Record<string, unknown> {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  };
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');
  private readonly access = new Logger('Access');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const error = this.describe(exception);

    // Log every denial in one place, so no future guard can forget to (root AGENTS.md §8).
    if (error.status === 401 || error.status === 403) {
      this.access.warn(
        auditLine(AuditEvent.UNAUTHORISED_ACCESS, {
          status: error.status,
          code: error.code,
          method: req.method,
          path: req.originalUrl,
          // Set by JwtAuthGuard once step 3 lands; absent for an unauthenticated caller.
          userId: (req as Request & { caller?: { id: string } }).caller?.id ?? null,
        }),
      );
    }

    res.status(error.status).json(toErrorBody(error));
  }

  private describe(exception: unknown): ErrorShape {
    if (exception instanceof AppError) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      // Thrown by Nest itself (an unmatched route, a malformed body). Give it a code so the
      // frontend never has to branch on a message.
      const status = exception.getStatus();
      return { status, code: codeForStatus(status), message: exception.message };
    }

    // An unexpected failure. Log the stack, but tell the caller nothing about it.
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    return {
      status: 500,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred.',
    };
  }
}
