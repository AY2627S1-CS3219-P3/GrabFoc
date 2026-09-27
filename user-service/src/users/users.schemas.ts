/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Sonnet 5), date: 2026-09-27
 * Scope: Generated the query schema for GET /admin/users (Step 10 of the build order in
 *        user-service/AGENTS.md), following the existing Zod DTO conventions in
 *        src/auth/auth.schemas.ts.
 * Author review: Verified via Postman against the compose stack on 2026-09-27 — an unknown
 *                `email` query param and an invalid `role` value are both rejected with 400,
 *                confirming the `.strict()` scope cut — see /ai/usage-log.md.
 */
import { z } from 'zod';

/**
 * `GET /admin/users`. Filters only by `role` and `status` for now — no pagination and no
 * `email` filter (a deliberate scope cut from what AGENTS.md's endpoint table lists, agreed
 * with the service owner; revisit if the user list grows or an email-search need shows up).
 */
export const AdminListUsersQuerySchema = z
  .object({
    role: z.enum(['USER', 'ADMIN']).optional(),
    status: z.enum(['ACTIVE', 'DEACTIVATED', 'SUSPENDED']).optional(),
  })
  .strict();

export type AdminListUsersQuery = z.infer<typeof AdminListUsersQuerySchema>;
