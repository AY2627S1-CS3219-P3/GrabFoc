/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-29
Scope: Mapped User Service error codes to user-facing copy without coupling the shared parser to one service.
Author review: Jie Yang reviewed this file.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
Scope: Added HAS_ACTIVE_ORDERS and LAST_ADMIN copy for account deactivation.
Author review: Pending review by Deanson.
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
  // AI-generated (pending review by Deanson)
  HAS_ACTIVE_ORDERS: 'Finish or cancel your ongoing orders, as requester and as courier, before deactivating.',
  LAST_ADMIN: 'Promote another admin first. You are the only admin.',
};

// AI-generated (reviewed by Jie Yang)
export function userErrorMessage(error: ServiceError, fallback?: string): string {
  const message = (error.code && messages[error.code]) || fallback || error.message;
  const retry = error.retryAfterSeconds;
  const attempts = error.attemptsRemaining;
  if (retry !== undefined && (error.code === 'ACCOUNT_LOCKED' || error.code === 'RATE_LIMITED'))
    return `${message} Try again in ${Math.max(1, Math.ceil(retry / 60))} minute${retry > 60 ? 's' : ''}.`;
  if (attempts !== undefined && error.code === 'OTP_INVALID')
    return `${message} ${attempts} attempt${attempts === 1 ? '' : 's'} remaining.`;
  return message;
}
