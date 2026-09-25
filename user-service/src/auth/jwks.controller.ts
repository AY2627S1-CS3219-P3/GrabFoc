/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated the JWKS endpoint.
 * Author review: Read in full; `npm test` passes (67 tests), and a token was verified against the live JWKS endpoint as another service would.
 */
import { Controller, Get } from '@nestjs/common';
import { Public } from './decorators';
import { JwtService } from './jwt.service';

@Controller('.well-known')
export class JwksController {
  constructor(private readonly jwt: JwtService) {}

  /**
   * The public half of the signing key, for the API Gateway and every other service to
   * verify tokens without holding any secret of ours.
   *
   * Public by necessity: a caller needs it *before* they have a token. It exposes nothing —
   * a public key verifies signatures, it cannot create them.
   */
  @Public()
  @Get('jwks.json')
  jwks() {
    return this.jwt.getJwks();
  }
}
