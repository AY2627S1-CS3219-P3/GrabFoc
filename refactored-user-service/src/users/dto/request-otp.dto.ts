/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from RequestOtpSchema in user-service/src/users/users.schemas.ts (original disclosure: Claude Code, Claude Sonnet 5, 2026-09-27); field rules come from common/validation/fields.ts.
 * Author review: Pending Deanson's review.
 */
// AI-generated (review pending: Deanson)
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { OtpPurpose } from '../../infra/redis/redis.constants';

// POST /users/me/otp. Only the four purposes a logged-in user requests; the others come from other flows.
export const RequestOtpSchema = z
  .object({
    purpose: z.enum([
      OtpPurpose.EMAIL_CHANGE,
      OtpPurpose.MOBILE_CHANGE,
      OtpPurpose.PASSWORD_CHANGE,
      OtpPurpose.DEACTIVATION,
    ]),
  })
  .strict();

export class RequestOtpDto extends createZodDto(RequestOtpSchema) {}
