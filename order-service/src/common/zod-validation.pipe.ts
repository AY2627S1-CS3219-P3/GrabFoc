/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated the Zod validation pipe, following user-service/src/common/zod-validation.pipe.ts.
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
 */
import { Injectable, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { AppError, ErrorCode } from './errors';

/** Validates a body, query or param. Object schemas must be `.strict()` so unknown fields are a 400. */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    // Field names only; rejected values are not echoed back.
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'The request is invalid.', {
      fields: result.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(input)',
        message: issue.message,
      })),
    });
  }
}
