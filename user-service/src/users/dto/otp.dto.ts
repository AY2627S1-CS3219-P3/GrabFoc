/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from VerifyNewEmailSchema and DeactivateSchema in user-service/src/users/users.schemas.ts (original disclosure: Claude Code, Claude Sonnet 5, 2026-09-27); field rules come from common/validation/fields.ts.
 * Author review: Successfully reviewed by Deanson, 2026-10-16.
 */
// AI-generated (reviewed by Deanson)
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { OtpSchema } from '../../common/validation/fields';

// Body of both POST /users/me/email/verify and POST /users/me/deactivate.
export const OtpBodySchema = z
  .object({
    otp: OtpSchema,
  })
  .strict();

export class OtpDto extends createZodDto(OtpBodySchema) {}
