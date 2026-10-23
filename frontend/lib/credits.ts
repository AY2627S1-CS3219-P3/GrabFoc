/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Added frontend types and display helpers for the existing Credit balance and transaction history contract (#61).
Author review: pending — Jie Yang to record the review.
*/
export type CreditBalance = { userId: string; available: number; reserved: number };

export type CreditTransactionType = 'GRANT' | 'RESERVE' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'RELEASE';

export type CreditTransaction = {
  id: number;
  orderId: string | null;
  type: CreditTransactionType;
  availableChange: number;
  reservedChange: number;
  createdAt: string;
};

/** `nextBefore` is the `before` for the next page, or null on the last page. */
export type CreditTransactionPage = { items: CreditTransaction[]; nextBefore: number | null };

// AI-generated (review pending)
export const transactionLabels: Record<CreditTransactionType, string> = {
  GRANT: 'Starting credits',
  RESERVE: 'Reserved for an order',
  TRANSFER_OUT: 'Paid to the courier',
  TRANSFER_IN: 'Earned as a courier',
  RELEASE: 'Returned from a cancelled order',
};

export function creditsPath(userId: string, rest = ''): string {
  return `/api/session/credits/${encodeURIComponent(userId)}${rest}`;
}

export function signedCredits(change: number): string {
  return change > 0 ? `+${change}` : String(change);
}
