/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated the admin-only routes to list and replay dead letters (Jian Bing's decision K4;
 *        paths and status codes proposed by Claude Code and confirmed by him).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthedRequest, denied, JwtAuthGuard } from '../common/jwt-auth.guard';
import { parseOr400 } from '../credits/credit.schemas';
import { DeadLetter, DeadLettersService } from './dead-letters.service';

const statusSchema = z.enum(['open', 'replayed', 'all']);
const eventIdSchema = z
  .string()
  .uuid()
  .transform((id) => id.toLowerCase());

/** Dead letters name other users' orders, so only admins may see or replay them. */
function requireAdmin(req: AuthedRequest): void {
  if (req.caller.role !== 'ADMIN') {
    throw denied(req, 403, 'Only admins can view or replay dead letters.', req.caller);
  }
}

@Controller('admin/credits/dead-letters')
@UseGuards(JwtAuthGuard)
export class DeadLettersController {
  constructor(private readonly deadLetters: DeadLettersService) {}

  @Get()
  async list(@Query('status') rawStatus: string | undefined, @Req() req: AuthedRequest): Promise<{ items: DeadLetter[] }> {
    // The role check comes first, so a USER learns nothing from validation errors.
    requireAdmin(req);
    const status = parseOr400(statusSchema, rawStatus ?? 'open', 'status');
    return { items: await this.deadLetters.list(status) };
  }

  @Post(':eventId/replay')
  @HttpCode(200)
  replay(@Param('eventId') rawEventId: string, @Req() req: AuthedRequest): Promise<DeadLetter> {
    requireAdmin(req);
    return this.deadLetters.replay(parseOr400(eventIdSchema, rawEventId, 'event id'));
  }
}
