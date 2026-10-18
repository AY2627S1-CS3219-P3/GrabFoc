/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from ChangePasswordSchema in user-service/src/users/users.schemas.ts (original disclosure: Claude Code, Claude Sonnet 5, 2026-09-27); field rules come from common/validation/fields.ts.
 * Author review: Successfully reviewed by Deanson, 2026-10-16.
 */
// AI-generated (reviewed by Deanson)
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { OtpSchema, PasswordSchema } from '../../common/validation/fields';

// POST /users/me/password. Sets a password, so the full policy applies.
export const ChangePasswordSchema = z
  .object({
    otp: OtpSchema,
    newPassword: PasswordSchema,
  })
  .strict();

export class ChangePasswordDto extends createZodDto(ChangePasswordSchema) {}
