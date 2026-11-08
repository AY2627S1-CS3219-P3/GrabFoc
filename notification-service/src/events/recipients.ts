/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Generated the recipient rule from the "Who gets emailed" table in AGENTS.md (#152).
 * Author review: pending — Jie Yang to record the review.
 */
import { OrderStatus } from '../messaging/messages';

export type RecipientRole = 'REQUESTER' | 'COURIER';

export interface Recipient {
  role: RecipientRole;
  userId: string;
}

/** Who is emailed about an order entering `status` (AGENTS.md "Who gets emailed" [Decided]). */
export function recipientsFor(status: OrderStatus, requesterId: string, courierId: string | null): Recipient[] {
  const requester: Recipient = { role: 'REQUESTER', userId: requesterId };
  const courier: Recipient[] = courierId ? [{ role: 'COURIER', userId: courierId }] : [];
  switch (status) {
    case 'ACCEPTED':
    case 'PICKED_UP':
    case 'IN_PROGRESS':
    case 'ARRIVED':
      return [requester];
    case 'COMPLETED':
    case 'CANCELLED':
      return [requester, ...courier];
    default:
      return [];
  }
}
