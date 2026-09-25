/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated the auth module wiring, including the global guard order.
 * Author review: Read in full; `npm test` passes (67 tests).
 */
import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwksController } from './jwks.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtService } from './jwt.service';
import { RolesGuard } from './roles.guard';

@Global()
@Module({
  controllers: [JwksController],
  providers: [
    JwtService,
    // Order matters: Nest runs APP_GUARDs in the order they are provided, and RolesGuard
    // needs the caller that JwtAuthGuard attaches.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [JwtService],
})
export class AuthModule {}
