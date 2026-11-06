/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated the Zod validation pipe, following user-service/src/common/zod-validation.pipe.ts.
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Allowed schemas whose input differs from their output (e.g. string → Date).
 * Author review: Reviewed in full
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-06
 * Scope: Zod 4 upgrade: ZodType<Output, Input> replaces the removed ZodTypeDef parameter.
 * Author review (Jian Bing, 2026-11-06): Went through the change with Claude Code's walkthrough and understood it;
 *   CI passed (user-service and supplier-service tests and builds). Approved and merged by Deanson Choo (#193).
 */
import { Injectable, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { AppError, ErrorCode } from './errors';

/** Validates a body, query or param. Object schemas must be `.strict()` so unknown fields are a 400. */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  // AI-generated (Claude Code), reviewed by Jian Bing: Zod 4's ZodType takes <Output, Input>.
  constructor(private readonly schema: ZodType<T, unknown>) {}

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
