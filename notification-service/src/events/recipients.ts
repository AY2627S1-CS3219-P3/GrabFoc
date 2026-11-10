/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Generated the recipient rule from the "Who gets emailed" table in AGENTS.md (#152).
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
 * Scope: Added changeRecipients for OrderChangeRequest (#186), from Jie Yang's decisions in chat.
 * Author review: pending — Jie Yang to record the review.
 */
import { OrderChange, OrderStatus } from '../messaging/messages';

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

/**
 * Who is emailed about a proposal (#186, Jie Yang 2026-11-10): the other party when it is made, the
 * proposer when it is approved, rejected or expires. An approved completion or cancellation emails
 * nobody here: the OrderCompleted / OrderCancelled email already tells both parties.
 */
export function changeRecipients(change: OrderChange, requesterId: string, courierId: string | null): Recipient[] {
  const requester: Recipient = { role: 'REQUESTER', userId: requesterId };
  const courier: Recipient | null = courierId ? { role: 'COURIER', userId: courierId } : null;
  const proposer = change.proposedBy === requesterId ? requester : change.proposedBy === courierId ? courier : null;
  if (!proposer) return [];
  if (change.outcome === 'CREATED') {
    const other = proposer.role === 'REQUESTER' ? courier : requester;
    return other ? [other] : [];
  }
  if (change.outcome === 'APPROVED' && change.kind !== 'TIMING_CHANGE') return [];
  return [proposer];
}
