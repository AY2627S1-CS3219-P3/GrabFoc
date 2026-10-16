/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from AdminListUsersQuerySchema in user-service/src/users/users.schemas.ts (original disclosure: Claude Code, Claude Sonnet 5, 2026-09-27); field rules come from common/validation/fields.ts.
 * Author review: Pending Deanson's review.
 */
// AI-generated (review pending: Deanson)
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Role } from '../../common/enums/role.enum';
import { UserStatus } from '../../common/enums/user-status.enum';

// GET /admin/users. role/status filters only; pagination and an email filter are deferred.
export const ListUsersQuerySchema = z
  .object({
    role: z.enum(Role).optional(),
    status: z.enum(UserStatus).optional(),
  })
  .strict();

export class ListUsersQueryDto extends createZodDto(ListUsersQuerySchema) {}
