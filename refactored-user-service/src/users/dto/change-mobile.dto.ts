/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from ChangeMobileSchema in user-service/src/users/users.schemas.ts (original disclosure: Claude Code, Claude Sonnet 5, 2026-09-27); field rules come from common/validation/fields.ts.
 * Author review: Pending Deanson's review.
 */
// AI-generated (review pending: Deanson)
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  CountryCodeSchema,
  MobileNumberSchema,
  OtpSchema,
  withMobileCheck,
} from '../../common/validation/fields';

// PATCH /users/me/mobile. Same pairing check as registration.
export const ChangeMobileSchema = withMobileCheck(
  z
    .object({
      countryCode: CountryCodeSchema,
      mobileNumber: MobileNumberSchema,
      otp: OtpSchema,
    })
    .strict(),
);

export class ChangeMobileDto extends createZodDto(ChangeMobileSchema) {}
