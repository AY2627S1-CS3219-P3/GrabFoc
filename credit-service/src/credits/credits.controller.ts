/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
 * Scope: Generated the /internal/credits routes in credit-service/AGENTS.md: 201 for a new
 *        reserve, 200 for a repeated one, 200 for transfer and release.
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Removed the transfer and release routes: they are Kafka commands only (team consensus).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ServiceKeyGuard } from '../common/service-key.guard';
import { parseOr400, reserveSchema } from './credit.schemas';
import { CreditsService, Hold } from './credits.service';

// Order's synchronous call. Transfer and release are Kafka commands on credit.commands (team
// consensus, 2026-10-18), handled by messaging/kafka.runner.ts.
@Controller('internal/credits')
@UseGuards(ServiceKeyGuard)
export class CreditsController {
  constructor(private readonly credits: CreditsService) {}

  @Post('reserve')
  async reserve(@Body() body: unknown, @Res({ passthrough: true }) res: Response): Promise<Hold> {
    const { hold, created } = await this.credits.reserve(parseOr400(reserveSchema, body, 'reserve request'));
    // A retry gets the same body as the original, with 200 instead of 201.
    res.status(created ? 201 : 200);
    return hold;
  }
}
