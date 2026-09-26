/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated the auth module wiring, including the global guard order and the sign-up,
 *        login, session and password-reset providers.
 * Author review: Read in full; `npm test` passes.
 */
import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwksController } from './jwks.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtService } from './jwt.service';
import { LockoutService } from './lockout.service';
import { LoginController } from './login.controller';
import { LoginService } from './login.service';
import { PasswordResetController } from './password-reset.controller';
import { PasswordResetService } from './password-reset.service';
import { RegistrationController } from './registration.controller';
import { RegistrationService } from './registration.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { RolesGuard } from './roles.guard';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';

@Global()
@Module({
  controllers: [
    JwksController,
    RegistrationController,
    LoginController,
    SessionController,
    PasswordResetController,
  ],
  providers: [
    JwtService,
    SessionService,
    RefreshTokensRepository,
    RegistrationService,
    LockoutService,
    LoginService,
    PasswordResetService,
    // Order matters: Nest runs APP_GUARDs in the order they are provided, and RolesGuard
    // needs the caller that JwtAuthGuard attaches.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [JwtService, SessionService, RefreshTokensRepository],
})
export class AuthModule {}
