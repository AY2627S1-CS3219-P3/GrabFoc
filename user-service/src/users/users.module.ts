/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: New module wiring for the restructure (replaces user-service/src/users/users.module.ts; original disclosure: Claude Code, Claude Opus 5 / Sonnet 5, 2026-09-26/27).
 * Author review: Successfully reviewed by Deanson, 2026-10-16.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
 * Scope: Registered OrderClient (#71).
 * Author review: Reviewed by Zi Yi, 2026-10-20.
 */
// AI-generated (reviewed by Deanson)
import { Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module';
import { OrderClient } from './order.client';
import { UsersAdminController } from './users-admin.controller';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  imports: [SecurityModule],
  controllers: [UsersController, UsersAdminController],
  providers: [UsersService, UsersRepository, OrderClient],
  // The repository stays private: the users table is reached only through UsersService.
  exports: [UsersService],
})
export class UsersModule {}
