/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5; Claude Sonnet 5 for the 2026-09-27 additions),
 *       date: 2026-09-26, updated 2026-09-27
 * Scope: Generated the users module wiring, including the startup admin bootstrap provider.
 *        2026-09-27: registered AdminController/AdminService for GET /admin/users (Step 10,
 *        endpoint 1); registered AdminLockService for PATCH /admin/users/:userId/role
 *        (Step 10, endpoint 2). 2026-09-28: registered UsersController/UsersService for
 *        GET /users/me and PATCH /users/me (Step 11).
 * Author review: Read in full; the service starts and serves the sign-up routes under docker
 *                compose, and the bootstrap runs on an empty database. GET /admin/users was
 *                verified via Postman on 2026-09-27; the role-change wiring was verified via
 *                Postman on 2026-09-28; the Step 11 wiring was verified via Postman the same
 *                day — see /ai/usage-log.md.
 */
import { Global, Module } from '@nestjs/common';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { AdminController } from './admin.controller';
import { AdminLockService } from './admin-lock.service';
import { AdminService } from './admin.service';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

/**
 * Global because both feature tracks need the same table: credentials and sessions on one
 * side, profile and the admin lifecycle on the other.
 */
@Global()
@Module({
  controllers: [AdminController, UsersController],
  // `AdminBootstrapService` is deliberately not exported. Nothing calls it — it runs itself
  // once, from Nest's `onApplicationBootstrap` hook.
  providers: [UsersRepository, AdminBootstrapService, AdminService, AdminLockService, UsersService],
  exports: [UsersRepository],
})
export class UsersModule {}
