/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Sonnet 5), date: 2026-09-28
 * Scope: Generated the self-profile controller for GET /users/me and PATCH /users/me
 *        (Step 11). 2026-09-28: added the six Step 12 routes (POST /users/me/otp, POST
 *        /users/me/email, POST /users/me/email/verify, PATCH /users/me/mobile, POST
 *        /users/me/password, POST /users/me/deactivate).
 * Author review: Verified via Postman against the compose stack on 2026-09-28 — see
 *                users.service.ts and /ai/usage-log.md. All six Step 12 routes were manually
 *                verified via Postman on 2026-09-28 too — see /ai/usage-log.md.
 */
import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { Caller } from '../auth/caller';
import { CurrentUser } from '../auth/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  ChangeEmailBody,
  ChangeEmailSchema,
  ChangeMobileBody,
  ChangeMobileSchema,
  ChangePasswordBody,
  ChangePasswordSchema,
  DeactivateBody,
  DeactivateSchema,
  RequestOtpBody,
  RequestOtpSchema,
  UpdateSelfProfileBody,
  UpdateSelfProfileSchema,
  VerifyNewEmailBody,
  VerifyNewEmailSchema,
} from './users.schemas';
import { UsersService } from './users.service';

/**
 * No `@Roles(...)` here: both USER and ADMIN reach these routes, same as every other
 * `/users/me*` endpoint. `JwtAuthGuard` (global) is what closes them to anonymous callers;
 * `@CurrentUser()` is the only source of identity — never a body field or path parameter.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() caller: Caller) {
    return this.users.getSelf(caller.id);
  }

  /**
   * No OTP: AGENTS.md's OTP table lists 0 OTPs for a display-name change, unlike email/mobile/
   * password changes.
   */
  @Patch('me')
  updateMe(
    @CurrentUser() caller: Caller,
    @Body(new ZodValidationPipe(UpdateSelfProfileSchema)) body: UpdateSelfProfileBody,
  ) {
    return this.users.updateDisplayName(caller.id, body.displayName);
  }

  /** 202: the code has been handed to the mail server, not yet read by anyone. */
  @Post('me/otp')
  @HttpCode(202)
  requestOtp(
    @CurrentUser() caller: Caller,
    @Body(new ZodValidationPipe(RequestOtpSchema)) body: RequestOtpBody,
  ) {
    return this.users.requestOtp(caller.id, body.purpose);
  }

  /**
   * 202: `newEmail` is not yet the account's address — a second code has just been mailed to
   * it, and only `POST /users/me/email/verify` commits the change.
   */
  @Post('me/email')
  @HttpCode(202)
  requestEmailChange(
    @CurrentUser() caller: Caller,
    @Body(new ZodValidationPipe(ChangeEmailSchema)) body: ChangeEmailBody,
  ) {
    return this.users.requestEmailChange(caller.id, body.newEmail, body.otp);
  }

  /** 200 with the refreshed self profile, not 202: the change is committed by this call. */
  @Post('me/email/verify')
  @HttpCode(200)
  verifyEmailChange(
    @CurrentUser() caller: Caller,
    @Body(new ZodValidationPipe(VerifyNewEmailSchema)) body: VerifyNewEmailBody,
  ) {
    return this.users.verifyEmailChange(caller.id, body.otp);
  }

  @Patch('me/mobile')
  changeMobile(
    @CurrentUser() caller: Caller,
    @Body(new ZodValidationPipe(ChangeMobileSchema)) body: ChangeMobileBody,
  ) {
    return this.users.changeMobile(caller.id, body.countryCode, body.mobileNumber, body.otp);
  }

  /** 204: every refresh token was just revoked, so the caller's other sessions log in again. */
  @Post('me/password')
  @HttpCode(204)
  changePassword(
    @CurrentUser() caller: Caller,
    @Body(new ZodValidationPipe(ChangePasswordSchema)) body: ChangePasswordBody,
  ) {
    return this.users.changePassword(caller.id, body.otp, body.newPassword);
  }

  /** 204: the account is deactivated and every refresh token revoked; there is nothing to return. */
  @Post('me/deactivate')
  @HttpCode(204)
  deactivate(
    @CurrentUser() caller: Caller,
    @Body(new ZodValidationPipe(DeactivateSchema)) body: DeactivateBody,
  ) {
    return this.users.deactivateSelf(caller.id, body.otp);
  }
}
