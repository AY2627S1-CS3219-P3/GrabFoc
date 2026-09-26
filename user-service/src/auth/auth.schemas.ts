/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-26
 * Scope: Generated the Zod schemas for the register, verify and resend bodies, expressing the
 *        field rules recorded under "Rules" in user-service/AGENTS.md.
 * Author review: Read in full; each rule checked against the backlog IDs it cites, and
 *                `npm test` covers every branch.
 */
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { z } from 'zod';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, normalizeEmail } from '../crypto';

/**
 * Only NUS addresses may hold an account (U1.1.1, U2.1.1). Subdomains are NOT accepted:
 * `evil.u.nus.edu` is a different domain that we do not control, so the match is exact.
 */
export const ALLOWED_EMAIL_DOMAINS = ['u.nus.edu', 'nus.edu.sg'];

/**
 * Normalises *before* validating, so every downstream caller — the encrypted column, the
 * `email_hash` lookup, the Redis key, the address the OTP is mailed to — sees the same string
 * and `Alex@U.NUS.edu` cannot become a second account.
 */
export const EmailSchema = z
  .string({ required_error: 'is required', invalid_type_error: 'must be a string' })
  .transform(normalizeEmail)
  .pipe(
    z
      .string()
      .email('must be a valid email address')
      .refine((value) => ALLOWED_EMAIL_DOMAINS.includes(value.slice(value.lastIndexOf('@') + 1)), {
        message: `must be an NUS address (${ALLOWED_EMAIL_DOMAINS.map((d) => '@' + d).join(' or ')})`,
      }),
  );

/**
 * U1.1.4 and U3.2.2. The floor is 8 **characters**, which is what the backlog asks for; the
 * ceiling is 72 **bytes**, which is all bcrypt reads — see `crypto/password.ts`. Rejecting an
 * over-long password here turns what would be a 500 from `hashPassword` into a 400 that names
 * the field.
 */
export const PasswordSchema = z
  .string({ required_error: 'is required', invalid_type_error: 'must be a string' })
  .min(MIN_PASSWORD_LENGTH, `must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= MAX_PASSWORD_LENGTH, {
    message: `must be at most ${MAX_PASSWORD_LENGTH} bytes (about ${MAX_PASSWORD_LENGTH} plain characters, fewer if you use emoji or non-Latin script)`,
  })
  .refine((value) => /[a-z]/.test(value), { message: 'must contain a lowercase letter' })
  .refine((value) => /[A-Z]/.test(value), { message: 'must contain an uppercase letter' })
  .refine((value) => /\d/.test(value), { message: 'must contain a digit' });

/** A six-digit code as a string, so a leading zero survives JSON (`012345`, not `12345`). */
export const OtpSchema = z
  .string({ required_error: 'is required', invalid_type_error: 'must be a string' })
  .regex(/^\d{6}$/, 'must be six digits');

export const DisplayNameSchema = z
  .string({ required_error: 'is required', invalid_type_error: 'must be a string' })
  .trim()
  .min(1, 'is required')
  .max(100, 'must be at most 100 characters');

/** An international dialling prefix, e.g. `+65`. Bounded at 5 characters by the column. */
export const CountryCodeSchema = z
  .string({ required_error: 'is required', invalid_type_error: 'must be a string' })
  .regex(/^\+\d{1,4}$/, 'must be a dialling code such as +65');

/** Digits only (U1.1.5): the country code is a separate field, so no spaces, dashes or plus. */
export const MobileNumberSchema = z
  .string({ required_error: 'is required', invalid_type_error: 'must be a string' })
  .regex(/^\d{4,15}$/, 'must be digits only, without the country code');

/**
 * Neither half of a phone number can be judged alone: `+65` is a real prefix and `12345678` is
 * eight digits, but together they are not a valid Singapore number. libphonenumber-js knows
 * each country's real numbering plan, which a regex cannot (U1.1.5, U3.1.3).
 */
function attachMobileCheck<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine(
    (body: { countryCode: string; mobileNumber: string }, ctx: z.RefinementCtx) => {
      const parsed = parsePhoneNumberFromString(`${body.countryCode}${body.mobileNumber}`);
      if (!parsed?.isValid()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['mobileNumber'],
          message: `is not a valid number for ${body.countryCode}`,
        });
      }
    },
  );
}

/**
 * `.strict()` on every body: an unknown field is a 400, never silently dropped (root
 * AGENTS.md §8). That is what stops a caller smuggling `"role": "ADMIN"` into a sign-up.
 */
export const RegisterSchema = attachMobileCheck(
  z
    .object({
      displayName: DisplayNameSchema,
      email: EmailSchema,
      countryCode: CountryCodeSchema,
      mobileNumber: MobileNumberSchema,
      password: PasswordSchema,
    })
    .strict(),
);

export type RegisterInput = z.infer<typeof RegisterSchema>;

export const VerifyRegistrationSchema = z
  .object({ email: EmailSchema, otp: OtpSchema })
  .strict();

export type VerifyRegistrationInput = z.infer<typeof VerifyRegistrationSchema>;

export const ResendOtpSchema = z.object({ email: EmailSchema }).strict();

export type ResendOtpInput = z.infer<typeof ResendOtpSchema>;

/**
 * Login does **not** reuse `PasswordSchema`. The policy governs what a password may be *set*
 * to, not what may be submitted: an account created before a rule changed must still be able
 * to log in, and a 400 explaining that the submitted value lacks a digit both leaks the
 * policy and answers differently from the 401 every other wrong password gets. Any non-empty
 * string goes through to the bcrypt comparison.
 */
export const LoginSchema = z
  .object({ email: EmailSchema, password: z.string().min(1, 'is required') })
  .strict();

export type LoginInput = z.infer<typeof LoginSchema>;

/**
 * The body of both `POST /auth/refresh` and `POST /auth/logout`.
 *
 * No shape validation beyond "a non-empty string": a token that is the wrong length or the
 * wrong alphabet must get the same 401 as one that is merely unknown, and a 400 describing
 * the expected format would tell a caller what a real token looks like.
 */
export const RefreshTokenBodySchema = z
  .object({ refreshToken: z.string().min(1, 'is required') })
  .strict();

export type RefreshTokenBodyInput = z.infer<typeof RefreshTokenBodySchema>;
