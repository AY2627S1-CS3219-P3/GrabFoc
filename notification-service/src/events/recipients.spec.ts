/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Generated the recipient rule tests from the "Who gets emailed" table in AGENTS.md (#152).
 * Author review: pending — Jie Yang to record the review.
 */
import { recipientsFor } from './recipients';

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
