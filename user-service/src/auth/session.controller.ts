/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-26
 * Scope: Generated the refresh and logout routes and their status codes, from the endpoint
 *        tables in user-service/AGENTS.md.
 * Author review: Read in full; both routes checked against those tables and exercised against
 *                the compose stack, including the reuse case.
 */
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RefreshTokenBodyInput, RefreshTokenBodySchema } from './auth.schemas';
import { Caller } from './caller';
import { CurrentUser, Public } from './decorators';
import { SessionService } from './session.service';

@Controller('auth')
export class SessionController {
  constructor(private readonly sessions: SessionService) {}

  /**
   * `@Public` by necessity: the caller reaches for this precisely when their access token has
   * expired, so requiring one would make the endpoint useless. The refresh token *is* the
   * credential here.
   */
  @Public()
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body(new ZodValidationPipe(RefreshTokenBodySchema)) body: RefreshTokenBodyInput) {
    return this.sessions.refresh(body.refreshToken);
  }

  /**
   * Not `@Public`: the global `JwtAuthGuard` requires a valid access token, and the caller's
   * id comes from that token — never from the body. A caller can therefore only ever end
   * their own session, even if they somehow learned someone else's refresh token.
   *
   * 204: there is nothing to say, and nothing to reveal about whether the token was live.
   */
  @HttpCode(204)
  @Post('logout')
  async logout(
    @CurrentUser() caller: Caller,
    @Body(new ZodValidationPipe(RefreshTokenBodySchema)) body: RefreshTokenBodyInput,
  ): Promise<void> {
    await this.sessions.logout(body.refreshToken, caller.id);
  }
}
