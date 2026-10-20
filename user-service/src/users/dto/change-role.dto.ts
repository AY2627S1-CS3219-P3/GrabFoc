/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from ChangeRoleSchema in user-service/src/users/users.schemas.ts (original disclosure: Claude Code, Claude Sonnet 5, 2026-09-27); field rules come from common/validation/fields.ts.
 * Author review: Successfully reviewed by Deanson, 2026-10-16.
 */
// AI-generated (reviewed by Deanson)
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Role } from '../../common/enums/role.enum';

// PATCH /admin/users/:userId/role. The target comes from the route, not the body.
export const ChangeRoleSchema = z
  .object({
    role: z.enum(Role),
  })
  .strict();

export class ChangeRoleDto extends createZodDto(ChangeRoleSchema) {}
