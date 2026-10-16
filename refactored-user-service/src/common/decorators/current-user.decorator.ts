/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from CurrentUser in user-service/src/auth/decorators.ts (original disclosure: Claude Code, Claude Opus 5, 2026-09-25); reads req.user and takes an optional field name.
 * Author review: Pending Deanson's review.
 */
// AI-generated (review pending: Deanson)
import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { AuthUser, AuthedRequest } from '../types/auth-user';

/**
 * Injects the verified caller, or one field of it: `@CurrentUser() user` / `@CurrentUser('id') id`.
 * The only way a handler learns who is calling (root AGENTS.md §8).
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, context: ExecutionContext) => {
    const { user } = context.switchToHttp().getRequest<AuthedRequest>();
    if (!user) {
      // Only reachable if a @Public route asks for the caller.
      throw new Error('@CurrentUser used on a route that does not require authentication.');
    }
    return field ? user[field] : user;
  },
);
