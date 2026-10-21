/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15, 2026-10-16
 * Scope: 10-15: removed the scaffold sample; registered nestjs-zod's global validation pipe.
 *   10-16: wired ConfigModule, InfraModule, SecurityModule, UsersModule, the global AuthGuard and
 *   the JWKS/health controllers (replaces user-service/src/app.module.ts; original disclosure:
 *   Claude Code, Claude Opus 5, 2026-09-25).
 * Author review: 10-15 part reviewed by Deanson, 2026-10-15. 10-16 changes: successfully reviewed by Deanson, 2026-10-16.
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import * as path from 'path';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './common/guards/auth.guard';
import { validate } from './config/env.validation';
import { InfraModule } from './infra/infra.module';
import { SecurityModule } from './security/security.module';
import { UsersModule } from './users/users.module';
import { HealthController } from './utils/health.controller';
import { JwksController } from './utils/jwks.controller';

@Module({
  imports: [
    // The repo-root .env (git-ignored), if present. Real env vars win, which is how compose
    // points the service at its containers.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: path.resolve(__dirname, '../../.env'), validate }),
    InfraModule,
    SecurityModule,
    AuthModule,
    UsersModule,
  ],
  controllers: [JwksController, HealthController],
  providers: [
    // Every route needs a valid access token unless it is @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
    // Validates every request body/query/param whose type is a createZodDto class.
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
export class AppModule {}
