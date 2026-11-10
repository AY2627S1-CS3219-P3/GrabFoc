/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Generated the recipient rule tests from the "Who gets emailed" table in AGENTS.md (#152).
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
 * Scope: Added tests for OrderChangeRequest (#186).
 * Author review: pending — Jie Yang to record the review.
 */
import { changeRecipients, recipientsFor } from './recipients';

const requester = { role: 'REQUESTER', userId: 'r' };
const courier = { role: 'COURIER', userId: 'c' };

describe('recipientsFor', () => {
  it.each(['ACCEPTED', 'PICKED_UP', 'IN_PROGRESS', 'ARRIVED'] as const)('emails only the requester for %s', (status) => {
    expect(recipientsFor(status, 'r', 'c')).toEqual([requester]);
  });

  it('emails the requester and courier for COMPLETED', () => {
    expect(recipientsFor('COMPLETED', 'r', 'c')).toEqual([requester, courier]);
  });

  it('emails the requester and the assigned courier for CANCELLED', () => {
    expect(recipientsFor('CANCELLED', 'r', 'c')).toEqual([requester, courier]);
  });

  it('emails only the requester for CANCELLED when no courier was assigned', () => {
    expect(recipientsFor('CANCELLED', 'r', null)).toEqual([requester]);
  });

  it('emails nobody for PENDING', () => {
    expect(recipientsFor('PENDING', 'r', null)).toEqual([]);
  });
});

describe('changeRecipients (#186)', () => {
  type Outcome = 'CREATED' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  type Kind = 'TIMING_CHANGE' | 'CANCELLATION' | 'COMPLETION';
  const change = (outcome: Outcome, kind: Kind, proposedBy: string) => ({
    outcome,
    kind,
    proposedBy,
    confirmationId: 'x',
    proposedWindowStart: null,
    proposedWindowEnd: null,
  });

  it.each(['TIMING_CHANGE', 'CANCELLATION', 'COMPLETION'] as const)('emails the other party when a %s is proposed', (kind) => {
    expect(changeRecipients(change('CREATED', kind, 'r'), 'r', 'c')).toEqual([courier]);
    expect(changeRecipients(change('CREATED', kind, 'c'), 'r', 'c')).toEqual([requester]);
  });

  it.each(['REJECTED', 'EXPIRED'] as const)('emails the proposer when a proposal is %s', (outcome) => {
    expect(changeRecipients(change(outcome, 'TIMING_CHANGE', 'c'), 'r', 'c')).toEqual([courier]);
    expect(changeRecipients(change(outcome, 'TIMING_CHANGE', 'r'), 'r', 'c')).toEqual([requester]);
  });

  it('emails the proposer when a timing change is approved', () => {
    expect(changeRecipients(change('APPROVED', 'TIMING_CHANGE', 'r'), 'r', 'c')).toEqual([requester]);
  });

  it.each(['CANCELLATION', 'COMPLETION'] as const)('emails nobody for an approved %s: the state email covers it', (kind) => {
    expect(changeRecipients(change('APPROVED', kind, 'c'), 'r', 'c')).toEqual([]);
  });

  it('emails nobody when the proposer is neither party', () => {
    expect(changeRecipients(change('CREATED', 'CANCELLATION', 'someone'), 'r', 'c')).toEqual([]);
  });
});
