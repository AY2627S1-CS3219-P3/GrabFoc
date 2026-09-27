/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Sonnet 5), date: 2026-09-27
 * Scope: Generated the admin controller for GET /admin/users (Step 10, endpoint 1 only — the
 *        role-change route is deliberately not implemented yet).
 * Author review: Verified via Postman against the compose stack on 2026-09-27 (happy path,
 *                role/status filters, 400 on unknown/invalid query params, 403 for a non-admin,
 *                401 for no/invalid token) — see /ai/usage-log.md.
 */
import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Roles } from '../auth/decorators';
import { AdminService } from './admin.service';
import { AdminListUsersQuery, AdminListUsersQuerySchema } from './users.schemas';

/**
 * Every route here requires ADMIN (RolesGuard, enforced globally alongside JwtAuthGuard —
 * see AuthModule). A non-admin gets 403 before any handler runs; ErrorFilter logs the denial,
 * so nothing here needs to.
 */
@Controller('admin/users')
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  listUsers(@Query(new ZodValidationPipe(AdminListUsersQuerySchema)) query: AdminListUsersQuery) {
    return this.admin.listUsers(query);
  }
}
