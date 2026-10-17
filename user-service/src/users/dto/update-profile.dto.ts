/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from UpdateSelfProfileSchema in user-service/src/users/users.schemas.ts (original disclosure: Claude Code, Claude Sonnet 5, 2026-09-27); field rules come from common/validation/fields.ts.
 * Author review: Successfully reviewed by Deanson, 2026-10-16.
 */
// AI-generated (reviewed by Deanson)
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DisplayNameSchema } from '../../common/validation/fields';

// PATCH /users/me. Strict, so `role` or `status` cannot be smuggled in.
export const UpdateProfileSchema = z
  .object({
    displayName: DisplayNameSchema,
  })
  .strict();

export class UpdateProfileDto extends createZodDto(UpdateProfileSchema) {}
