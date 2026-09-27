/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Sonnet 5), date: 2026-09-27
 * Scope: Generated the admin controller for GET /admin/users (Step 10, endpoint 1), and
 *        2026-09-27: added PATCH :userId/role (Step 10, endpoint 2).
 * Author review: GET /admin/users verified via Postman against the compose stack on
 *                2026-09-27 (happy path, role/status filters, 400 on unknown/invalid query
 *                params, 403 for a non-admin, 401 for no/invalid token). PATCH :userId/role
 *                verified via Postman on 2026-09-28 — see /ai/usage-log.md.
 */
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { Caller } from '../auth/caller';
import { CurrentUser, Roles } from '../auth/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminService } from './admin.service';
import {
  AdminListUsersQuery,
  AdminListUsersQuerySchema,
  ChangeRoleBody,
  ChangeRoleSchema,
} from './users.schemas';

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

  /**
   * `ParseUUIDPipe` rejects a malformed `:userId` with 400 before it ever reaches the service
   * or a raw SQL query — a syntactically invalid UUID would otherwise surface as a Postgres
   * "invalid input syntax for type uuid" error instead of the intended 404.
   */
  @Patch(':userId/role')
  changeRole(
    @CurrentUser() caller: Caller,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(ChangeRoleSchema)) body: ChangeRoleBody,
  ) {
    return this.admin.changeRole(caller.id, userId, body.role);
  }
}
