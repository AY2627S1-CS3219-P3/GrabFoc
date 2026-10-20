/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from ChangeEmailSchema in user-service/src/users/users.schemas.ts (original disclosure: Claude Code, Claude Sonnet 5, 2026-09-27); field rules come from common/validation/fields.ts.
 * Author review: Successfully reviewed by Deanson, 2026-10-16.
 */
// AI-generated (reviewed by Deanson)
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { EmailSchema, OtpSchema } from '../../common/validation/fields';

// POST /users/me/email. `otp` is the EMAIL_CHANGE code mailed to the current address.
export const ChangeEmailSchema = z
  .object({
    newEmail: EmailSchema,
    otp: OtpSchema,
  })
  .strict();

export class ChangeEmailDto extends createZodDto(ChangeEmailSchema) {}
