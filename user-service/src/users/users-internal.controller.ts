/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-02
 * Scope: Generated the service-to-service route the Notification Service uses to look up a
 *        recipient's email (#151). Shape approved by Jie Yang, 2026-11-02.
 * Author review: pending — Jie Yang to record the review; Deanson / Zi Yi (User owners) to review.
 */
// AI-generated (pending review)
import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { Internal } from '../common/guards/service-key.guard';
import { UsersService } from './users.service';

// X-Service-Key instead of a user token. The gateway never routes /internal/**.
@Controller('internal/users')
@Internal()
export class UsersInternalController {
  constructor(private readonly users: UsersService) {}

  // ParseUUIDPipe: a malformed id is a 400, not a Postgres error.
  @Get(':userId/contact')
  contact(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.users.getContactEmail(userId);
  }
}
