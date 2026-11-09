/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
 * Scope: Generated the socket payload schemas from the chat plan
 * Author review: Reviewed by Deanson, 2026-11-09.
 */
import { z } from 'zod';

// Strict: unknown fields are rejected, not ignored (root AGENTS.md §8).

export const GetHistory = z.strictObject({ beforeId: z.number().int().positive().optional() });

export const GetMissedMessages = z.strictObject({ afterId: z.number().int().min(0) });

export const SendMessage = z.strictObject({
  clientMsgId: z.string().min(1).max(64),
  // Stored trimmed; whitespace-only messages are rejected.
  content: z.string().trim().min(1).max(2_000),
});

/** A short reason for the ack, e.g. "content: Too big: expected string to have <=2000 characters". */
export function describeError(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message;
}
