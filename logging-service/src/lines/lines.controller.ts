/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated the ADMIN-only query endpoint, following the controller style of
 *        supplier-service/src/locations/locations.controller.ts.
 * Author review: pending — Cole Lin to record what he checked.
 */
import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/auth';
import { logQuerySchema, parseOr400 } from './line.schema';
import { LinesService } from './lines.service';

/**
 * Reading the log store is ADMIN-only. Pooled across services, these rows say which user called
 * which path and when, so a USER must not be able to read anyone's — not even their own, which
 * would still expose the rest of the line.
 */
@Controller()
@Roles('ADMIN')
export class LinesController {
  constructor(private readonly lines: LinesService) {}

  @Get('logs')
  list(@Query() query: Record<string, unknown>) {
    return this.lines.query(parseOr400(logQuerySchema, query, 'query parameters'));
  }
}
