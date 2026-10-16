/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated the OTP and mail module wiring.
 * Author review: Read in full; the service starts and connects under docker compose.
 */
import { Global, Module } from '@nestjs/common';
import { MailService, SmtpMailService } from '../mail/mail.service';
import { OtpService } from './otp.service';

@Global()
@Module({
  providers: [OtpService, { provide: MailService, useClass: SmtpMailService }],
  exports: [OtpService, MailService],
})
export class OtpModule {}
