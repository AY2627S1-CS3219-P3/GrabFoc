/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
 * Scope: Generated the ticket check from the chat plan
 * Author review: Reviewed by Deanson, 2026-11-09.
 */
import { jwtVerify } from 'jose';
import { z } from 'zod';

/** `sub` and `orderId` must be UUIDs; other standard JWT fields are allowed (and ignored). */
const ticketClaims = z.object({ sub: z.uuid(), orderId: z.uuid() });

export interface TicketIdentity {
  userId: string;
  orderId: string;
}

/**
 * Verifies a ticket Order signed. Throws Error('unauthorized') for anything wrong with it, so raw
 * verification errors never reach the client.
 */
export async function verifyTicket(ticket: unknown, secret: Uint8Array): Promise<TicketIdentity> {
  if (typeof ticket !== 'string') throw new Error('unauthorized');
  try {
    const { payload } = await jwtVerify(ticket, secret, {
      algorithms: ['HS256'],
      audience: 'chat',
      // jwtVerify only rejects an expired token if `exp` exists.
      requiredClaims: ['sub', 'exp', 'orderId'],
    });
    const { sub, orderId } = ticketClaims.parse(payload);
    return { userId: sub, orderId };
  } catch {
    throw new Error('unauthorized');
  }
}
