/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Sonnet 5), date: 2026-09-27
 * Scope: Generated the query schema for GET /admin/users (Step 10, endpoint 1) and the body
 *        schema for PATCH /admin/users/:userId/role (Step 10, endpoint 2), following the
 *        existing Zod DTO conventions in src/auth/auth.schemas.ts. 2026-09-28: added
 *        UpdateSelfProfileSchema for PATCH /users/me (Step 11), reusing DisplayNameSchema
 *        rather than redefining the rule.
 * Author review: AdminListUsersQuerySchema verified via Postman against the compose stack on
 *                2026-09-27 — an unknown `email` query param and an invalid `role` value are
 *                both rejected with 400, confirming the `.strict()` scope cut. ChangeRoleSchema
 *                verified via Postman on 2026-09-28 (an invalid `role` value is rejected with
 *                400). UpdateSelfProfileSchema verified via Postman on 2026-09-28 (an unknown
 *                field, e.g. `role`, is rejected with 400) — see /ai/usage-log.md.
 */
import { z } from 'zod';
import { DisplayNameSchema } from '../auth/auth.schemas';

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

/** `PATCH /admin/users/:userId/role`. The target user id comes from the route, not the body. */
export const ChangeRoleSchema = z.object({ role: z.enum(['USER', 'ADMIN']) }).strict();

export type ChangeRoleBody = z.infer<typeof ChangeRoleSchema>;

/**
 * `PATCH /users/me` (Step 11). `.strict()` is what gives "any other field → 400"
 * (AGENTS.md) — a caller cannot smuggle `role`, `status` or anything else past this.
 */
export const UpdateSelfProfileSchema = z.object({ displayName: DisplayNameSchema }).strict();

export type UpdateSelfProfileBody = z.infer<typeof UpdateSelfProfileSchema>;
