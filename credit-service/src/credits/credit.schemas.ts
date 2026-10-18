/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
 * Scope: Generated strict Zod schemas for the reserve, transfer and release request bodies, and
 *        the 400 helper copied from supplier-service/src/locations/location.schemas.ts.
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Added the path id schema for GET /credits/:userId.
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Ids lower-cased (PR #48 review).
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Removed the transfer/release HTTP schemas (they are Kafka commands only, team consensus).
 * Author review: Jian Bing, 2026-10-18 — manually tested on this branch: unit, integration and Kafka suites pass (incl. transfer/release no longer offered over HTTP); reserve over HTTP, 409 when credits are short, a TransferCredits command over Kafka pays the courier, and repeating it changes nothing.
 */
import { z } from 'zod';
import { ProblemException } from '../common/problem';

// PostgreSQL returns UUIDs in lower case; lower-casing ids here keeps a repeated request written in
// upper case equal to the stored hold, so it stays idempotent (PR #48 review).
const id = z
  .string()
  .uuid()
  .transform((v) => v.toLowerCase());

// Unknown fields are rejected, not ignored (root AGENTS.md §8).
export const reserveSchema = z
  .object({
    orderId: id,
    requesterId: id,
    // Credits are whole numbers (root AGENTS.md §1); capped at PostgreSQL's INTEGER maximum.
    amount: z.number().int().positive().max(2147483647),
  })
  .strict();

// The path id for GET /credits/:userId. Lower-cased so it compares equal to the token's `sub`.
export const userIdParamSchema = z
  .string()
  .uuid()
  .transform((id) => id.toLowerCase());

export type ReserveRequest = z.infer<typeof reserveSchema>;
// Transfer and release arrive only as Kafka commands, validated in messaging/messages.ts.
export interface TransferRequest {
  orderId: string;
  courierId: string;
}
export interface ReleaseRequest {
  orderId: string;
}

export function parseOr400<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, data: unknown, what: string): T {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  const issues = result.error.issues
    .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
    .join('; ');
  throw new ProblemException(400, `Invalid ${what}: ${issues}`);
}
