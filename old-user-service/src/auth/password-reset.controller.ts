/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-26
 * Scope: Generated the two password-reset routes and their status codes, from the "Public"
 *        endpoint table in user-service/AGENTS.md.
 * Author review: Read in full; both routes, status codes and bodies checked against that table
 *                and exercised against the compose stack.
 */
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  ForgotPasswordInput,
  ForgotPasswordSchema,
  ResetPasswordInput,
  ResetPasswordSchema,
} from './auth.schemas';
import { Public } from './decorators';
import { PasswordResetService } from './password-reset.service';

/**
 * Both `@Public`: someone who has forgotten their password cannot be asked for a token. This is
 * the endpoint the bootstrap admin uses to claim its account, too — see "Roles and admin
 * lifecycle" in AGENTS.md.
 */
@Controller('auth/password')
export class PasswordResetController {
  constructor(private readonly passwordReset: PasswordResetService) {}

  /**
   * 202 with a fixed message, whether or not the address has an account (AGENTS.md, "Forgot and
   * reset password"). The message is returned rather than an empty 202 so the frontend has
   * something to show without having to invent wording that might imply the account exists.
   *
   * No `otpExpiresAt`, unlike `/auth/register/resend-otp`: that field would be a straight answer
   * to "does this address have an account", since there is nothing to expire when it does not.
   */
  @Public()
  @HttpCode(202)
  @Post('forgot')
  async forgot(
    @Body(new ZodValidationPipe(ForgotPasswordSchema)) body: ForgotPasswordInput,
  ): Promise<{ message: string }> {
    await this.passwordReset.forgot(body);
    return {
      message: 'If an account exists for that email, a reset code has been sent to it.',
    };
  }

  /**
   * 204: the password is set, and there is deliberately no session to hand back. Every refresh
   * token was just revoked, so the user logs in again — on this device and on every other.
   */
  @Public()
  @HttpCode(204)
  @Post('reset')
  async reset(
    @Body(new ZodValidationPipe(ResetPasswordSchema)) body: ResetPasswordInput,
  ): Promise<void> {
    await this.passwordReset.reset(body);
  }
}
