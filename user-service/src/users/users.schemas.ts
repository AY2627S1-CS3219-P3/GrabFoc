/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Sonnet 5), date: 2026-09-27
 * Scope: Generated the query schema for GET /admin/users (Step 10, endpoint 1) and the body
 *        schema for PATCH /admin/users/:userId/role (Step 10, endpoint 2), following the
 *        existing Zod DTO conventions in src/auth/auth.schemas.ts. 2026-09-28: added
 *        UpdateSelfProfileSchema for PATCH /users/me (Step 11), reusing DisplayNameSchema
 *        rather than redefining the rule.
 * Author review: AdminListUsersQuerySchema verified via Postman against the compose stack on
 *                2026-09-27 — an unknown `email` query param and an invalid `role` value are
 *                both rejected with 400, confirming the `.strict()` scope cut. ChangeRoleSchema
 *                verified via Postman on 2026-09-28 (an invalid `role` value is rejected with
 *                400). UpdateSelfProfileSchema verified via Postman on 2026-09-28 (an unknown
 *                field, e.g. `role`, is rejected with 400) — see /ai/usage-log.md.
 *                2026-09-28: added the six Step 12 body schemas (RequestOtpSchema,
 *                ChangeEmailSchema, VerifyNewEmailSchema, ChangeMobileSchema,
 *                ChangePasswordSchema, DeactivateSchema), reusing EmailSchema/OtpSchema/
 *                CountryCodeSchema/MobileNumberSchema/PasswordSchema/attachMobileCheck
 *                rather than redefining any of those rules.
 * Author review: The six Step 12 schemas were verified via Postman against the compose stack
 *                on 2026-09-28 — see /ai/usage-log.md.
 */
import { z } from 'zod';
import {
  attachMobileCheck,
  CountryCodeSchema,
  DisplayNameSchema,
  EmailSchema,
  MobileNumberSchema,
  OtpSchema,
  PasswordSchema,
} from '../auth/auth.schemas';

/**
 * `GET /admin/users`. Filters only by `role` and `status` for now — no pagination and no
 * `email` filter (a deliberate scope cut from what AGENTS.md's endpoint table lists, agreed
 * with the service owner; revisit if the user list grows or an email-search need shows up).
 */
export const AdminListUsersQuerySchema = z
  .object({
    role: z.enum(['USER', 'ADMIN']).optional(),
    status: z.enum(['ACTIVE', 'DEACTIVATED', 'SUSPENDED']).optional(),
  })
  .strict();

export type AdminListUsersQuery = z.infer<typeof AdminListUsersQuerySchema>;

/** `PATCH /admin/users/:userId/role`. The target user id comes from the route, not the body. */
export const ChangeRoleSchema = z.object({ role: z.enum(['USER', 'ADMIN']) }).strict();

export type ChangeRoleBody = z.infer<typeof ChangeRoleSchema>;

/**
 * `PATCH /users/me` (Step 11). `.strict()` is what gives "any other field → 400"
 * (AGENTS.md) — a caller cannot smuggle `role`, `status` or anything else past this.
 */
export const UpdateSelfProfileSchema = z.object({ displayName: DisplayNameSchema }).strict();

export type UpdateSelfProfileBody = z.infer<typeof UpdateSelfProfileSchema>;

/**
 * `POST /users/me/otp` (Step 12). Only the four purposes a logged-in user can request a code
 * for — REGISTRATION, PASSWORD_RESET and NEW_EMAIL_VERIFY are issued by other flows, never by
 * this endpoint (AGENTS.md, "OTP" table).
 */
export const RequestOtpSchema = z
  .object({
    purpose: z.enum(['EMAIL_CHANGE', 'MOBILE_CHANGE', 'PASSWORD_CHANGE', 'DEACTIVATION']),
  })
  .strict();

export type RequestOtpBody = z.infer<typeof RequestOtpSchema>;

/**
 * `POST /users/me/email`. The `otp` here is the EMAIL_CHANGE code already mailed to the
 * *current* address (AGENTS.md: "Change email | 2 — first to the current email, then to the
 * new one"); this endpoint proves that, then mails a second code to `newEmail`.
 */
export const ChangeEmailSchema = z.object({ newEmail: EmailSchema, otp: OtpSchema }).strict();

export type ChangeEmailBody = z.infer<typeof ChangeEmailSchema>;

/** `POST /users/me/email/verify`. The NEW_EMAIL_VERIFY code mailed to the new address. */
export const VerifyNewEmailSchema = z.object({ otp: OtpSchema }).strict();

export type VerifyNewEmailBody = z.infer<typeof VerifyNewEmailSchema>;

/**
 * `PATCH /users/me/mobile`. Reuses `attachMobileCheck` so a country code and number that are
 * individually well-formed but not a valid pair together (e.g. an 8-digit number under a
 * prefix that takes 10) still fail — the same rule `RegisterSchema` enforces.
 */
export const ChangeMobileSchema = attachMobileCheck(
  z
    .object({
      countryCode: CountryCodeSchema,
      mobileNumber: MobileNumberSchema,
      otp: OtpSchema,
    })
    .strict(),
);

export type ChangeMobileBody = z.infer<typeof ChangeMobileSchema>;

/**
 * `POST /users/me/password`. Reuses `PasswordSchema`, not the bare-string rule `LoginSchema`
 * uses — like `ResetPasswordSchema`, this *sets* a password, so the policy applies.
 */
export const ChangePasswordSchema = z.object({ otp: OtpSchema, newPassword: PasswordSchema }).strict();

export type ChangePasswordBody = z.infer<typeof ChangePasswordSchema>;

/** `POST /users/me/deactivate`. Just the DEACTIVATION code; the caller comes from the token. */
export const DeactivateSchema = z.object({ otp: OtpSchema }).strict();

export type DeactivateBody = z.infer<typeof DeactivateSchema>;
