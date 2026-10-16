/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated this DTO; field rules come from common/validation/fields.ts.
 * 2026-10-16 (Claude Opus 5.5): removed the .js import suffixes for the CommonJS switch (pending review).
 * Author review: Read in full and reviewed by Deanson, 2026-10-15.
 */
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { EmailSchema, OtpSchema } from '../../common/validation/fields';

export const VerifyRegisterSchema = z
  .object({
    email: EmailSchema,
    otp: OtpSchema,
  })
  .strict();

export class VerifyRegisterDto extends createZodDto(VerifyRegisterSchema) {}
