/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
 * Scope: Generated strict Zod schemas for the reserve, transfer and release request bodies, and
 *        the 400 helper copied from supplier-service/src/locations/location.schemas.ts.
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Ids lower-cased (PR #48 review).
 * Author review: pending — Jian Bing to record what he checked.
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

export const transferSchema = z
  .object({
    orderId: id,
    courierId: id,
  })
  .strict();

export const releaseSchema = z
  .object({
    orderId: id,
  })
  .strict();

export type ReserveRequest = z.infer<typeof reserveSchema>;
export type TransferRequest = z.infer<typeof transferSchema>;
export type ReleaseRequest = z.infer<typeof releaseSchema>;

export function parseOr400<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, data: unknown, what: string): T {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  const issues = result.error.issues
    .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
    .join('; ');
  throw new ProblemException(400, `Invalid ${what}: ${issues}`);
}
