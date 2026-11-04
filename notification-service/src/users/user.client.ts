/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Generated the client for User's GET /internal/users/:userId/contact (#151, #153), following
 *        order-service/src/integrations/credit.client.ts.
 * Author review: pending — Jie Yang to record the review.
 */
// AI-generated (pending review)
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { config } from '../config';

/**
 * Why a recipient's email couldn't be looked up. Stored as `last_error`, so it never holds the
 * address or User's response body.
 * - USER_NOT_FOUND: User has no such id (404).
 * - USER_UNAVAILABLE: User didn't answer, or answered with an error.
 * - USER_BAD_RESPONSE: User answered 200 without an email.
 */
export class UserLookupError extends Error {
  constructor(readonly category: 'USER_NOT_FOUND' | 'USER_UNAVAILABLE' | 'USER_BAD_RESPONSE') {
    super(`Recipient email not found: ${category}`);
  }
}

const contactSchema = z.object({ email: z.string().email() });

@Injectable()
export class UserClient {
  /** The user's current email. Works for suspended and deactivated users too (#151). */
  async contactEmail(userId: string): Promise<string> {
    let res: Response;
    try {
      res = await fetch(`${config.userUrl}/internal/users/${encodeURIComponent(userId)}/contact`, {
        headers: { 'x-service-key': config.userServiceKey },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new UserLookupError('USER_UNAVAILABLE');
    }
    if (res.status === 404) throw new UserLookupError('USER_NOT_FOUND');
    if (!res.ok) throw new UserLookupError('USER_UNAVAILABLE');
    const body = contactSchema.safeParse(await res.json().catch(() => null));
    if (!body.success) throw new UserLookupError('USER_BAD_RESPONSE');
    return body.data.email;
  }
}
