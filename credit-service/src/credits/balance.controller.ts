/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: GET /credits/:userId from the redesign spec §4.4: a USER reads only their own balance,
 *        an ADMIN reads anyone's; the token says who asks, the path says whose balance.
 * Author review: pending — Jian Bing to record what he checked.
 */
import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { AuthedRequest, denied, JwtAuthGuard } from '../common/jwt-auth.guard';
import { parseOr400, userIdParamSchema } from './credit.schemas';
import { Balance, CreditsService } from './credits.service';

@Controller('credits')
@UseGuards(JwtAuthGuard)
export class BalanceController {
  constructor(private readonly credits: CreditsService) {}

  @Get(':userId')
  balance(@Param('userId') rawUserId: string, @Req() req: AuthedRequest): Promise<Balance> {
    const userId = parseOr400(userIdParamSchema, rawUserId, 'user id');
    if (req.caller.role !== 'ADMIN' && req.caller.id.toLowerCase() !== userId) {
      throw denied(req, 403, 'You can only view your own credit balance.', req.caller);
    }
    return this.credits.getBalance(userId);
  }
}
