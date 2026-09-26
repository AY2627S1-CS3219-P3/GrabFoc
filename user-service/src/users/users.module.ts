/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-26
 * Scope: Generated the users module wiring, including the startup admin bootstrap provider.
 * Author review: Read in full; the service starts and serves the sign-up routes under docker
 *                compose, and the bootstrap runs on an empty database.
 */
import { Global, Module } from '@nestjs/common';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { UsersRepository } from './users.repository';

/**
 * Global because both feature tracks need the same table: credentials and sessions on one
 * side, profile and the admin lifecycle on the other.
 */
@Global()
@Module({
  // `AdminBootstrapService` is deliberately not exported. Nothing calls it — it runs itself
  // once, from Nest's `onApplicationBootstrap` hook.
  providers: [UsersRepository, AdminBootstrapService],
  exports: [UsersRepository],
})
export class UsersModule {}
