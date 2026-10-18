/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
 * Scope: Generated unit tests for the request schemas.
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Added the upper-case id test (PR #48 review).
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Removed the transfer/release schema tests with the schemas.
 * Author review: pending — Jian Bing to record what he checked.
 */
import { ProblemException } from '../common/problem';
import { parseOr400, reserveSchema } from './credit.schemas';

const ORDER = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

describe('reserveSchema', () => {
  it('accepts a valid request', () => {
    expect(reserveSchema.parse({ orderId: ORDER, requesterId: USER, amount: 3 })).toEqual({
      orderId: ORDER,
      requesterId: USER,
      amount: 3,
    });
  });

  it.each([
    ['zero amount', { orderId: ORDER, requesterId: USER, amount: 0 }],
    ['negative amount', { orderId: ORDER, requesterId: USER, amount: -1 }],
    ['fractional amount', { orderId: ORDER, requesterId: USER, amount: 1.5 }],
    ['amount as a string', { orderId: ORDER, requesterId: USER, amount: '3' }],
    ['amount above INTEGER range', { orderId: ORDER, requesterId: USER, amount: 2147483648 }],
    ['non-uuid order id', { orderId: 'order-1', requesterId: USER, amount: 3 }],
    ['missing requester', { orderId: ORDER, amount: 3 }],
    ['unknown field', { orderId: ORDER, requesterId: USER, amount: 3, state: 'TRANSFERRED' }],
  ])('rejects %s', (_label, body) => {
    expect(reserveSchema.safeParse(body).success).toBe(false);
  });
});

describe('parseOr400', () => {
  it('throws a 400 naming the bad field', () => {
    try {
      parseOr400(reserveSchema, { orderId: 'nope', requesterId: USER, amount: 3 }, 'reserve request');
      throw new Error('expected a ProblemException');
    } catch (err) {
      expect(err).toBeInstanceOf(ProblemException);
      expect((err as ProblemException).getStatus()).toBe(400);
      expect((err as ProblemException).message).toContain('orderId');
    }
  });
});

// PR #48 review: PostgreSQL returns UUIDs in lower case, so a repeat in upper case must match.
describe('ids in upper case', () => {
  // Hex letters, so upper case actually differs from lower case.
  const ORDER = 'abcdef01-1111-4111-8111-111111111111';
  const USER = 'fedcba98-2222-4222-8222-222222222222';
  it('are lower-cased, so a repeated request still matches the stored hold', () => {
    expect(reserveSchema.parse({ orderId: ORDER.toUpperCase(), requesterId: USER.toUpperCase(), amount: 3 })).toEqual({
      orderId: ORDER,
      requesterId: USER,
      amount: 3,
    });
  });
});
