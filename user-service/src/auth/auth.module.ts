/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11, 2026-10-16
 * Scope: 10-11: registered AuthRepository as a provider. 10-16: removed AuthRepository (auth has no
 *   table of its own) and imported UsersModule and SecurityModule.
 * Author review: 10-11 part reviewed by Deanson, 2026-10-15. 10-16 changes: successfully reviewed by Deanson, 2026-10-16.
 */
import { Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [UsersModule, SecurityModule],
  controllers: [AuthController],
  providers: [AuthService]
})
export class AuthModule {}
