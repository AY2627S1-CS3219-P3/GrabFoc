/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-02
 * Scope: Generated the suspend body schema from docs/admin-dashboard-plan.md §4.3 (P5, #180).
 * Author review: Reviewed by Zi Yi, 2026-11-05.
 */
// AI-generated (reviewed by Zi Yi)
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// POST /admin/users/:userId/suspend. Free text, so it is never written to a log line.
export const SuspendUserSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export class SuspendUserDto extends createZodDto(SuspendUserSchema) {}
