/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from Public in user-service/src/auth/decorators.ts (original disclosure: Claude Code, Claude Opus 5, 2026-09-25).
 * Author review: Pending Deanson's review.
 */
// AI-generated (review pending: Deanson)
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Opts a route out of AuthGuard. Every other route needs a valid access token. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
