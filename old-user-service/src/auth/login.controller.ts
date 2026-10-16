/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-26
 * Scope: Generated the login route and its status code, from the "Public" endpoint table in
 *        user-service/AGENTS.md.
 * Author review: Read in full; the route, status codes and body checked against that table and
 *                exercised against the compose stack.
 */
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { LoginInput, LoginSchema } from './auth.schemas';
import { Public } from './decorators';
import { LoginService } from './login.service';

@Controller('auth')
export class LoginController {
  constructor(private readonly login: LoginService) {}

  /**
   * `@Public`, necessarily: this is where a token comes from. 200 rather than 201 — a session
   * is not a resource the caller can address afterwards.
   */
  @Public()
  @HttpCode(200)
  @Post('login')
  authenticate(@Body(new ZodValidationPipe(LoginSchema)) body: LoginInput) {
    return this.login.login(body);
  }
}
