/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-26
 * Scope: Generated the three sign-up routes and their status codes, from the "Public" endpoint
 *        table in user-service/AGENTS.md.
 * Author review: Read in full; every route, status code and body checked against that table
 *                and exercised against the compose stack.
 */
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  RegisterInput,
  RegisterSchema,
  ResendOtpInput,
  ResendOtpSchema,
  VerifyRegistrationInput,
  VerifyRegistrationSchema,
} from './auth.schemas';
import { Public } from './decorators';
import { RegistrationService } from './registration.service';

/**
 * All three are `@Public`: nobody has a token yet. `JwtAuthGuard` is global, so without the
 * decorator these would answer 401 — closed by default, which is the point (AGENTS.md,
 * "Tokens and RBAC").
 */
@Controller('auth')
export class RegistrationController {
  constructor(private readonly registration: RegistrationService) {}

  /** 201: a sign-up now exists, even though the `users` row does not yet. */
  @Public()
  @Post('register')
  register(@Body(new ZodValidationPipe(RegisterSchema)) body: RegisterInput) {
    return this.registration.register(body);
  }

  /** 200 with the auth response: the account exists and the user is logged in. */
  @Public()
  @HttpCode(200)
  @Post('register/verify')
  verify(@Body(new ZodValidationPipe(VerifyRegistrationSchema)) body: VerifyRegistrationInput) {
    return this.registration.verify(body);
  }

  /** 202, not 200: the code has been handed to the mail server, not yet read by anyone. */
  @Public()
  @HttpCode(202)
  @Post('register/resend-otp')
  resend(@Body(new ZodValidationPipe(ResendOtpSchema)) body: ResendOtpInput) {
    return this.registration.resend(body);
  }
}
