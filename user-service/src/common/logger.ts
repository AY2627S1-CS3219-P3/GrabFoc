/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated the redaction helper, the redacting logger and the structured audit events
 *        listed under "Logging" in user-service/AGENTS.md. Added the fatal() override after
 *        review found it bypassed redaction.
 * Author review: Read in full; `npm test` passes (7 tests).
 */
import { ConsoleLogger, LogLevel } from '@nestjs/common';

/**
 * Field names whose values must never reach a log (NFR5.1, root AGENTS.md §8).
 * Matching is case-insensitive and ignores `-` and `_`, so `X-Service-Key`, `service_key`
 * and `serviceKey` are all caught.
 */
const SENSITIVE_FIELDS = [
  'password',
  'newpassword',
  'currentpassword',
  'passwordhash',
  'otp',
  'otphash',
  'code',
  'token',
  'accesstoken',
  'refreshtoken',
  'tokenhash',
  'authorization',
  'servicekey',
  'xservicekey', // the X-Service-Key header on /internal/**
  'email',
  'newemail',
  'emailhash',
  'mobile',
  'mobilenumber',
  'privatekey',
  'secret',
];

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 6;

function isSensitive(key: string): boolean {
  return SENSITIVE_FIELDS.includes(key.toLowerCase().replace(/[-_]/g, ''));
}

/**
 * Returns a copy of `value` with every sensitive field replaced by `[REDACTED]`.
 * Redaction is by field name, so it only works on structured data — never interpolate a
 * password or an OTP into a message string, because nothing can strip it back out.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return value;
  if (value instanceof Error || value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitive(key) ? REDACTED : redact(item, depth + 1);
  }
  return out;
}

/** Nest's console logger, with every logged object passed through `redact` first. */
export class RedactingLogger extends ConsoleLogger {
  log(message: unknown, ...rest: unknown[]) {
    super.log(redact(message), ...rest.map((r) => redact(r)));
  }
  warn(message: unknown, ...rest: unknown[]) {
    super.warn(redact(message), ...rest.map((r) => redact(r)));
  }
  error(message: unknown, ...rest: unknown[]) {
    super.error(redact(message), ...rest.map((r) => redact(r)));
  }
  debug(message: unknown, ...rest: unknown[]) {
    super.debug(redact(message), ...rest.map((r) => redact(r)));
  }
  verbose(message: unknown, ...rest: unknown[]) {
    super.verbose(redact(message), ...rest.map((r) => redact(r)));
  }
  fatal(message: unknown, ...rest: unknown[]) {
    super.fatal(redact(message), ...rest.map((r) => redact(r)));
  }
}

/**
 * Every log level ConsoleLogger exposes. `RedactingLogger` must override all of them: any
 * level left to the base class writes its payload verbatim, which is how `fatal` slipped
 * through. `logger.spec.ts` asserts this list is fully covered, so a level added by a future
 * Nest version fails the test rather than silently leaking.
 */
export const LOG_METHODS = ['log', 'error', 'warn', 'debug', 'verbose', 'fatal'] as const;

/**
 * The structured events listed in AGENTS.md. They are emitted as single-line JSON so the
 * centralized logging N2H can consume them without parsing prose.
 */
export const AuditEvent = {
  UNAUTHORISED_ACCESS: 'UNAUTHORISED_ACCESS',
  ADMIN_ACTION: 'ADMIN_ACTION',
  ADMIN_BOOTSTRAPPED: 'ADMIN_BOOTSTRAPPED',
} as const;

export type AuditEvent = (typeof AuditEvent)[keyof typeof AuditEvent];

export function auditLine(event: AuditEvent, payload: Record<string, unknown>): string {
  return JSON.stringify({ event, timestamp: new Date().toISOString(), ...(redact(payload) as object) });
}

/**
 * Nest's `logLevels` option is the explicit set of levels to print, not a minimum — passing
 * `['log']` would hide warnings and errors. This expands a minimum level into that set.
 */
export function logLevelsFrom(minimum: LogLevel): LogLevel[] {
  const order: LogLevel[] = ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'];
  return order.slice(order.indexOf(minimum));
}
