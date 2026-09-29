/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-29
Scope: Mapped User Service error codes to user-facing copy without coupling the shared parser to one service.
Author review: Pending frontend owner review.
*/
import type { ServiceError } from './service-errors';

const messages: Record<string, string> = {
  INVALID_CREDENTIALS: 'Invalid email or password.',
  EMAIL_TAKEN: 'This email is already registered.',
  OTP_INVALID: 'That code is incorrect.',
  OTP_EXPIRED: 'That code has expired. Request a new one.',
  ACCOUNT_LOCKED: 'This account is temporarily locked.',
  RATE_LIMITED: 'Too many attempts. Please try again later.',
  ACCOUNT_DEACTIVATED: 'This account is deactivated.',
  ACCOUNT_SUSPENDED: 'This account is suspended.',
  SERVICE_UNAVAILABLE: 'The service is unavailable. Please try again.',
};

// AI-generated (pending human review)
export function userErrorMessage(error: ServiceError): string {
  const message = error.code ? messages[error.code] ?? error.message : error.message;
  const retry = error.retryAfterSeconds;
  const attempts = error.attemptsRemaining;
  if (retry !== undefined && (error.code === 'ACCOUNT_LOCKED' || error.code === 'RATE_LIMITED'))
    return `${message} Try again in ${Math.max(1, Math.ceil(retry / 60))} minute${retry > 60 ? 's' : ''}.`;
  if (attempts !== undefined && error.code === 'OTP_INVALID')
    return `${message} ${attempts} attempt${attempts === 1 ? '' : 's'} remaining.`;
  return message;
}
