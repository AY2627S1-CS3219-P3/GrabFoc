/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated the shared field rules to Deanson's decisions (see ai/usage-log.md).
 * Author review: Read in full and reviewed by Deanson, 2026-10-15.
 */
import { parsePhoneNumberFromString } from 'libphonenumber-js/mobile';
import { z } from 'zod';

/** Shared required/type message for string fields. */
const stringField = (iss: { input: unknown }) =>
  iss.input === undefined ? 'is required' : 'must be a string';

// ---------------------------------------------------------------- email

/** U1.1.1, U2.1.1: only these domains may hold an account. Exact match, so no subdomains. */
export const ALLOWED_EMAIL_DOMAINS = ['u.nus.edu', 'nus.edu.sg'];

/** Trims, then lowercases the whole address, so `Alex@U.NUS.edu` and `alex@u.nus.edu` are one account. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** The part after the last '@' must equal an allowed domain exactly (a trailing dot fails too). */
function hasAllowedDomain(email: string): boolean {
  return ALLOWED_EMAIL_DOMAINS.includes(email.slice(email.lastIndexOf('@') + 1));
}

export const EmailSchema = z
  .string({ error: stringField })
  .transform(normalizeEmail)
  .pipe(
    z.email({ error: 'must be a valid email address' }).refine(hasAllowedDomain, {
      error: `must be an NUS address (${ALLOWED_EMAIL_DOMAINS.map((d) => '@' + d).join(' or ')})`,
      // Only for a well-formed address, so a malformed one gets one message, not two. Not
      // `abort: true` on .email(): an abort also stops other fields' guarded checks (withMobileCheck).
      when: (payload) => payload.issues.length === 0,
    }),
  );

// ---------------------------------------------------------------- password

export const MIN_PASSWORD_LENGTH = 8;

/** bcrypt only reads the first 72 bytes, so anything longer would be silently truncated. */
export const MAX_PASSWORD_BYTES = 72;

/**
 * U1.1.4, U3.2.2: the policy for SETTING a password (register, reset, change). Used exactly as
 * typed, with no trimming. Every failing rule is reported, so the client can show a checklist.
 */
export const PasswordSchema = z
  .string({ error: stringField })
  .min(MIN_PASSWORD_LENGTH, { error: `must be at least ${MIN_PASSWORD_LENGTH} characters` })
  .refine((value) => Buffer.byteLength(value, 'utf8') <= MAX_PASSWORD_BYTES, {
    error: `must be at most ${MAX_PASSWORD_BYTES} characters (fewer if you use emoji or non-English characters)`,
  })
  .refine((value) => /[a-z]/.test(value), { error: 'must contain a lowercase letter' })
  .refine((value) => /[A-Z]/.test(value), { error: 'must contain an uppercase letter' })
  .refine((value) => /\d/.test(value), { error: 'must contain a digit' });

/**
 * Login accepts any non-empty string. Applying the policy here would answer a wrong password
 * with a 400 describing the policy instead of the same 401 every other wrong password gets.
 */
export const LoginPasswordSchema = z.string({ error: stringField }).min(1, { error: 'is required' });

// ---------------------------------------------------------------- display name

/** Matches the `display_name VARCHAR(100)` column. */
export const MAX_DISPLAY_NAME_LENGTH = 100;

/**
 * Trimmed, with any run of whitespace (including line breaks and tabs) collapsed to one space.
 * Any characters are allowed. Not unique: email is the identity, names are only for display.
 */
export const DisplayNameSchema = z
  .string({ error: stringField })
  .trim()
  .overwrite((value) => value.replace(/\s+/g, ' '))
  .min(1, { error: 'is required' })
  .max(MAX_DISPLAY_NAME_LENGTH, { error: `must be at most ${MAX_DISPLAY_NAME_LENGTH} characters` });

// ---------------------------------------------------------------- OTP

/** Shared with the future code generator, so the generator and this check can't disagree. */
export const OTP_LENGTH = 6;

/** ASCII 0-9 only: without the `u` flag, `\d` doesn't match full-width or other scripts' digits. */
const OTP_PATTERN = new RegExp(`^\\d{${OTP_LENGTH}}$`);

/**
 * A string, so a leading zero survives (`012345`, not `12345`). Whitespace is removed first so a
 * pasted code with stray spaces or a newline still works. Correctness, expiry and attempts are
 * the service's job, not this schema's.
 */
export const OtpSchema = z
  .string({ error: stringField })
  .overwrite((value) => value.replace(/\s/g, ''))
  .regex(OTP_PATTERN, { error: `must be ${OTP_LENGTH} digits` });

// ---------------------------------------------------------------- refresh token

/**
 * Any non-empty string, used exactly as sent. No format check: every bad token (malformed,
 * unknown, expired or revoked) reaches the service and gets the same 401.
 */
export const RefreshTokenValueSchema = z.string({ error: stringField }).min(1, { error: 'is required' });

// ---------------------------------------------------------------- phone

/** A dialling code such as `+65`: trimmed, `+` then 1–3 digits. Unknown codes are caught by withMobileCheck. */
export const CountryCodeSchema = z
  .string({ error: stringField })
  .trim()
  .regex(/^\+\d{1,3}$/, { error: 'must be a dialling code such as +65' });

/** Spaces and dashes removed (`9123 4567` → `91234567`), then 4–15 digits. The country code is a separate field. */
export const MobileNumberSchema = z
  .string({ error: stringField })
  .overwrite((value) => value.replace(/[\s-]/g, ''))
  .regex(/^\d{4,15}$/, { error: 'must be digits only, without the country code' });

/**
 * Wraps an object schema with countryCode + mobileNumber: together they must be a valid MOBILE number
 * for that country (`libphonenumber-js/mobile` treats landlines as invalid). Runs only when both fields
 * passed their own checks, so a bad country code doesn't also get a misleading number message.
 */
export function withMobileCheck<T extends z.ZodType<{ countryCode: string; mobileNumber: string }>>(schema: T) {
  return schema.refine(
    (body) => parsePhoneNumberFromString(`${body.countryCode}${body.mobileNumber}`)?.isValid() === true,
    {
      path: ['mobileNumber'],
      error: (iss) => `is not a valid mobile number for ${(iss.input as { countryCode: string }).countryCode}`,
      when: (payload) =>
        // path?.: object-level issues (e.g. .strict()'s unrecognized key) have no path yet here
        payload.issues.every((issue) => issue.path?.[0] !== 'countryCode' && issue.path?.[0] !== 'mobileNumber'),
    },
  );
}
