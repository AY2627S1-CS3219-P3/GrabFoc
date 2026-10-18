/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
 * Scope: Generated the /internal/credits routes in credit-service/AGENTS.md: 201 for a new
 *        reserve, 200 for a repeated one, 200 for transfer and release.
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Wrote the 2026-10-18 Author review text above from Jian Bing's account of what he checked (PR #97).
 * Author review: Jian Bing supplied what it states; the wording is Claude's.
 */
import { Body, Controller, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ServiceKeyGuard } from '../common/service-key.guard';
import { parseOr400, releaseSchema, reserveSchema, transferSchema } from './credit.schemas';
import { CreditsService, Hold } from './credits.service';

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

  @Post('transfer')
  @HttpCode(200)
  async transfer(@Body() body: unknown): Promise<Hold> {
    return (await this.credits.transfer(parseOr400(transferSchema, body, 'transfer request'))).hold;
  }

  @Post('release')
  @HttpCode(200)
  async release(@Body() body: unknown): Promise<Hold> {
    return (await this.credits.release(parseOr400(releaseSchema, body, 'release request'))).hold;
  }
}
