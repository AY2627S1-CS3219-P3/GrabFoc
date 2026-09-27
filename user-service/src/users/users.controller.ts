/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Sonnet 5), date: 2026-09-28
 * Scope: Generated the self-profile controller for GET /users/me and PATCH /users/me
 *        (Step 11).
 * Author review: Verified via Postman against the compose stack on 2026-09-28 — see
 *                users.service.ts and /ai/usage-log.md.
 */
import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Caller } from '../auth/caller';
import { CurrentUser } from '../auth/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { UpdateSelfProfileBody, UpdateSelfProfileSchema } from './users.schemas';
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
}
