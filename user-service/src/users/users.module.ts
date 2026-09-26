/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-26
 * Scope: Generated the users module wiring.
 * Author review: Read in full; the service starts and serves the sign-up routes under docker compose.
 */
import { Global, Module } from '@nestjs/common';
import { UsersRepository } from './users.repository';

/**
 * Global because both feature tracks need the same table: credentials and sessions on one
 * side, profile and the admin lifecycle on the other.
 */
@Global()
@Module({
  providers: [UsersRepository],
  exports: [UsersRepository],
})
export class UsersModule {}
