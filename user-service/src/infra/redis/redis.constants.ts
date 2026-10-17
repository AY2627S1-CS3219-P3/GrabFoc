/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Gathered the keys, TTLs and limits from user-service/src/otp/otp.service.ts, auth/lockout.service.ts and auth/registration.service.ts, and OtpPurpose from crypto/tokens.ts (original disclosures: Claude Code, Claude Opus 5, 2026-09-25/26). The pending sign-up key changes from reg: to otp:REGISTRATION: (ai/open_decisions.md, item 6).
 * Author review: Successfully reviewed by Deanson, 2026-10-16.
 */
// AI-generated (reviewed by Deanson)

/** Purposes an OTP can be issued for. Part of each code's HMAC, so a code only works for its own action. */
export enum OtpPurpose {
  REGISTRATION = 'REGISTRATION',
  PASSWORD_RESET = 'PASSWORD_RESET',
  EMAIL_CHANGE = 'EMAIL_CHANGE',
  NEW_EMAIL_VERIFY = 'NEW_EMAIL_VERIFY',
  MOBILE_CHANGE = 'MOBILE_CHANGE',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  DEACTIVATION = 'DEACTIVATION',
}

/**
 * Key builders. `subject` is the emailHash for register/resend/forgot/reset and the userId for
 * /users/me/*, so a known and an unknown address are treated identically.
 */
export const otpKey = (purpose: OtpPurpose, subject: string) => `otp:${purpose}:${subject}`;
export const otpRequestKeys = (subject: string) => ({
  counter: `otpreq:${subject}`,
  block: `otpblock:${subject}`,
});
export const loginKeys = (emailHash: string) => ({
  counter: `loginfail:${emailHash}`,
  block: `loginlock:${emailHash}`,
});

/** A code lives 5 minutes and allows 3 wrong attempts (U2.3.2). */
export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 3;

/** How long a pending sign-up waits for its code. Longer than one code, so a resend has something to resend. */
export const PENDING_SIGNUP_TTL_SECONDS = 15 * 60;

/**
 * A limit blocks on the `threshold`-th hit inside the window. OTP requests: 3 per 10 minutes,
 * so the 4th starts a 15-minute block. Logins: the 5th failure in 15 minutes locks for 15.
 */
export interface Limit {
  threshold: number;
  windowSeconds: number;
  blockSeconds: number;
}
export const OTP_REQUEST_LIMIT: Limit = { threshold: 4, windowSeconds: 10 * 60, blockSeconds: 15 * 60 };
export const LOGIN_LIMIT: Limit = { threshold: 5, windowSeconds: 15 * 60, blockSeconds: 15 * 60 };
