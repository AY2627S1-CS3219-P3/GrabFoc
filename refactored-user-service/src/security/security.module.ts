/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: New module wiring for the restructure; the RS256 settings come from
 *   user-service/src/auth/jwt.service.ts (original disclosure: Claude Code, Claude Opus 5, 2026-09-25).
 * Author review: Pending Deanson's review.
 */
// AI-generated (review pending: Deanson)
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { createPublicKey } from 'crypto';
import type { AppConfig } from '../config/env.validation';
import { OtpService } from './otp.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { ACCESS_TOKEN_TTL_SECONDS, JWT_ALGORITHM, TokensService } from './tokens.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const privateKey = config.get('jwtPrivateKeyPem', { infer: true });
        return {
          privateKey,
          publicKey: createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString(),
          signOptions: {
            algorithm: JWT_ALGORITHM,
            keyid: config.get('jwtKid', { infer: true }),
            expiresIn: ACCESS_TOKEN_TTL_SECONDS,
          },
          // Pinned, so a token claiming `alg: none` or HS256 is rejected.
          verifyOptions: { algorithms: [JWT_ALGORITHM] },
        };
      },
    }),
  ],
  providers: [OtpService, TokensService, RefreshTokensRepository],
  // The repository stays private: refresh_tokens is reached only through TokensService.
  exports: [OtpService, TokensService],
})
export class SecurityModule {}
