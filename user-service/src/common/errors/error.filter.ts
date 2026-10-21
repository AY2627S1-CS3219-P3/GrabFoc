/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from user-service/src/common/error.filter.ts and the 400 mapping in common/zod-validation.pipe.ts (original disclosures: Claude Code, Claude Opus 5, 2026-09-25). Now maps nestjs-zod's ZodValidationException; the audit log reads req.user. Response shape unchanged.
 * Author review: Successfully reviewed by Deanson, 2026-10-16.
 */
// AI-generated (reviewed by Deanson)
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import type { ZodError } from 'zod';
import { AuditEvent, auditLine } from '../logging/logger';
import type { AuthedRequest } from '../types/auth-user';
import { AppError } from './app-error';
import { ErrorCode, codeForStatus } from './error-codes';

interface ErrorShape {
  status: number;
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/** The response envelope. Every error body is built here and nowhere else. */
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
    const req = ctx.getRequest<AuthedRequest>();
    const res = ctx.getResponse<Response>();
    const error = this.describe(exception);

    // Every 401/403 is logged here, so no guard can forget to (root AGENTS.md §8).
    if (error.status === 401 || error.status === 403) {
      this.access.warn(
        auditLine(AuditEvent.UNAUTHORISED_ACCESS, {
          status: error.status,
          code: error.code,
          method: req.method,
          // req.path, not originalUrl: the query string could carry an email address.
          path: req.path,
          userId: req.user?.id ?? null,
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

    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError() as ZodError;
      return {
        status: 400,
        code: ErrorCode.VALIDATION_ERROR,
        message: 'The request is invalid.',
        // Field names and messages only; the rejected values may be a password or an OTP.
        details: {
          fields: zodError.issues.map((issue) => ({
            field: issue.path.join('.') || '(body)',
            message: issue.message,
          })),
        },
      };
    }

    if (exception instanceof HttpException) {
      // Thrown by Nest itself (an unmatched route, a malformed body, ParseUUIDPipe).
      const status = exception.getStatus();
      return { status, code: codeForStatus(status), message: exception.message };
    }

    // Unexpected: log the stack, tell the caller nothing.
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    return { status: 500, code: ErrorCode.INTERNAL_ERROR, message: 'An unexpected error occurred.' };
  }
}
