/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated the Zod validation pipe and its 400 VALIDATION_ERROR mapping.
 * Author review: Read in full; verified the service starts, migrates and serves /health under docker compose.
 */
import { Injectable, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { AppError } from './app-error';
import { ErrorCode } from './error-codes';

/**
 * Validates a request body, query or param against a Zod schema.
 *
 *   @Post() register(@Body(new ZodValidationPipe(RegisterSchema)) body: RegisterInput) {}
 *
 * Schemas MUST be declared with `.strict()`, so an unknown field is a 400 rather than being
 * silently dropped (root AGENTS.md §8). The pipe cannot enforce that for you — it is what
 * stops a caller smuggling `"role": "ADMIN"` into a profile update.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'The request is invalid.', {
      // Field names only. The rejected values are not echoed back, because they may be a
      // password or an OTP.
      fields: result.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(body)',
        message: issue.message,
      })),
    });
  }
}
