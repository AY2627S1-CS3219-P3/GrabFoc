/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
 * Scope: Generated unit tests for the request schemas.
 * Author review: pending — Jian Bing to record what he checked.
 */
import { ProblemException } from '../common/problem';
import { parseOr400, releaseSchema, reserveSchema, transferSchema } from './credit.schemas';

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

describe('transferSchema and releaseSchema', () => {
  it('accept valid requests', () => {
    expect(transferSchema.safeParse({ orderId: ORDER, courierId: USER }).success).toBe(true);
    expect(releaseSchema.safeParse({ orderId: ORDER }).success).toBe(true);
  });

  it('reject unknown fields, so a caller cannot slip in an amount', () => {
    expect(transferSchema.safeParse({ orderId: ORDER, courierId: USER, amount: 99 }).success).toBe(false);
    expect(releaseSchema.safeParse({ orderId: ORDER, requesterId: USER }).success).toBe(false);
  });
});

describe('parseOr400', () => {
  it('throws a 400 naming the bad field', () => {
    try {
      parseOr400(releaseSchema, { orderId: 'nope' }, 'release request');
      throw new Error('expected a ProblemException');
    } catch (err) {
      expect(err).toBeInstanceOf(ProblemException);
      expect((err as ProblemException).getStatus()).toBe(400);
      expect((err as ProblemException).message).toContain('orderId');
    }
  });
});
