/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from user-service/src/auth/jwks.controller.ts (original disclosure: Claude Code, Claude Opus 5, 2026-09-25).
 * Author review: Successfully reviewed by Deanson, 2026-10-16.
 */
// AI-generated (reviewed by Deanson)
import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { TokensService } from '../security/tokens.service';

@Controller('.well-known')
export class JwksController {
  constructor(private readonly tokens: TokensService) {}

  // Public: callers need it before they have a token. A public key cannot sign anything.
  @Public()
  @Get('jwks.json')
  jwks() {
    return this.tokens.getJwks();
  }
}
