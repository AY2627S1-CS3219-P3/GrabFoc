/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated the message types, headers and parsers: credit commands strictly (Credit owns
 *        them, K6) and UserRegistered tolerantly (the User Service owns it, K12).
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Outbound values may be raw bytes (PR #84 review); command ids lower-cased (PR #85 review).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { z } from 'zod';

/** A message as Credit sees it, whichever Kafka client delivered it. */
export interface InboundMessage {
  topic: string;
  key: string | null;
  value: Buffer | null;
  headers: Record<string, string>;
}

export interface OutboundMessage {
  topic: string;
  key: string | null;
  /** Raw bytes are passed through untouched, so a dead letter keeps exactly what failed. */
  value: Buffer | string;
  headers: Record<string, string>;
}

export interface Publisher {
  send(message: OutboundMessage): Promise<void>;
}

/** Injection token for the Publisher (Kafka in the app, a fake in tests). */
export const PUBLISHER = Symbol('PUBLISHER');

/** Headers Credit adds to messages it retries or dead-letters. */
export const HEADER = {
  /** How many times the message has failed so far. */
  attempt: 'x-attempt',
  /** When a retry may run, in milliseconds since the epoch. */
  dueAt: 'x-due-at',
  error: 'x-error',
  errorCode: 'x-error-code',
  /** The topic the message originally came from. */
  sourceTopic: 'x-source-topic',
  deadLetteredAt: 'x-dead-lettered-at',
} as const;

/** A message that can never be handled, however often it is retried. */
export class InvalidMessageError extends Error {}

const uuid = z.string().uuid();

// PostgreSQL returns UUIDs in lower case; lower-casing here keeps a repeated command written in
// upper case equal to the stored hold, so it stays a no-op instead of a conflict.
const id = uuid.transform((v) => v.toLowerCase());

// Credit owns the command contract, so unknown fields are rejected (root AGENTS.md §8).
export const creditCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('TransferCredits'), eventId: id, orderId: id, courierId: id }).strict(),
  z.object({ type: z.literal('ReleaseCredits'), eventId: id, orderId: id }).strict(),
]);
export type CreditCommand = z.infer<typeof creditCommandSchema>;

// The User Service owns UserRegistered (K6). Credit reads only what it uses (K12): the user id,
// and the event id for logs when it is a valid one. Everything else is ignored.
const userRegisteredSchema = z.object({
  userId: uuid,
  eventId: uuid.optional().catch(undefined),
});

export interface UserRegistered {
  userId: string;
  eventId: string | null;
}

function parseJson(value: Buffer | null): unknown {
  if (!value) throw new InvalidMessageError('The message has no value.');
  try {
    return JSON.parse(value.toString('utf8'));
  } catch {
    throw new InvalidMessageError('The message is not valid JSON.');
  }
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
}

export function parseCommand(value: Buffer | null): CreditCommand {
  const result = creditCommandSchema.safeParse(parseJson(value));
  if (!result.success) throw new InvalidMessageError(`Invalid credit command: ${describeIssues(result.error)}`);
  return result.data;
}

/** The UserRegistered event in `value`, or null for any other event type on the topic. */
export function parseUserEvent(value: Buffer | null): UserRegistered | null {
  const json = parseJson(value);
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new InvalidMessageError('The message is not a JSON object.');
  }
  if ((json as { type?: unknown }).type !== 'UserRegistered') return null;
  const result = userRegisteredSchema.safeParse(json);
  if (!result.success) throw new InvalidMessageError(`Invalid UserRegistered event: ${describeIssues(result.error)}`);
  return { userId: result.data.userId.toLowerCase(), eventId: result.data.eventId?.toLowerCase() ?? null };
}

/** Best-effort ids for logs and the dead-letter table; nulls when the message can't be read. */
export function peekIds(value: Buffer | null): { eventId: string | null; orderId: string | null; type: string | null } {
  let json: unknown;
  try {
    json = parseJson(value);
  } catch {
    return { eventId: null, orderId: null, type: null };
  }
  const fields = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {};
  const id = (v: unknown) => (uuid.safeParse(v).success ? (v as string).toLowerCase() : null);
  return {
    eventId: id(fields.eventId),
    orderId: id(fields.orderId),
    type: typeof fields.type === 'string' ? fields.type.slice(0, 64) : null,
  };
}
