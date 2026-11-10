/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Generated the order.events parser tests (#152).
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Added the user.events parser tests (#183).
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
 * Scope: Added tests for OrderChangeRequest (#186).
 * Author review: pending — Jie Yang to record the review.
 */
import { randomUUID } from 'crypto';
import { InvalidMessageError, parseOrderEvent, parseUserEvent, peekIds } from './messages';

const ids = { eventId: randomUUID(), orderId: randomUUID(), requesterId: randomUUID(), courierId: randomUUID() };

function event(overrides: Record<string, unknown> = {}, data: Record<string, unknown> = {}) {
  return {
    eventId: ids.eventId,
    eventType: 'OrderCancelled',
    occurredAt: '2026-11-01T10:00:00.000Z',
    data: {
      orderId: ids.orderId,
      requesterId: ids.requesterId,
      courierId: ids.courierId,
      status: 'CANCELLED',
      reason: 'EXPIRED',
      ...data,
    },
    ...overrides,
  };
}
const bytes = (value: unknown) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));

describe('parseOrderEvent', () => {
  it('reads an event in the shape Order publishes', () => {
    expect(parseOrderEvent(bytes(event()))).toEqual({
      ...ids,
      eventType: 'OrderCancelled',
      occurredAt: new Date('2026-11-01T10:00:00.000Z'),
      status: 'CANCELLED',
      reason: 'EXPIRED',
      change: null,
    });
  });

  describe('OrderChangeRequest (#186)', () => {
    const confirmationId = randomUUID();
    const change = (data: Record<string, unknown> = {}) =>
      event(
        { eventType: 'OrderChangeRequest' },
        {
          status: 'ACCEPTED',
          reason: undefined,
          outcome: 'CREATED',
          confirmationId,
          kind: 'TIMING_CHANGE',
          proposedBy: ids.requesterId,
          proposedWindowStart: '2026-11-10T07:00:00.000Z',
          proposedWindowEnd: '2026-11-10T09:00:00.000Z',
          ...data,
        },
      );

    it('reads the proposal', () => {
      expect(parseOrderEvent(bytes(change())).change).toEqual({
        outcome: 'CREATED',
        confirmationId,
        kind: 'TIMING_CHANGE',
        proposedBy: ids.requesterId,
        proposedWindowStart: new Date('2026-11-10T07:00:00.000Z'),
        proposedWindowEnd: new Date('2026-11-10T09:00:00.000Z'),
      });
    });

    it('has no window for a cancellation', () => {
      const parsed = parseOrderEvent(
        bytes(change({ kind: 'CANCELLATION', proposedWindowStart: undefined, proposedWindowEnd: undefined })),
      );
      expect(parsed.change).toMatchObject({ kind: 'CANCELLATION', proposedWindowStart: null, proposedWindowEnd: null });
    });

    it.each([
      ['an unknown outcome', { outcome: 'MAYBE' }, /outcome/],
      ['an unknown kind', { kind: 'REFUND' }, /kind/],
      ['a timing change with no window', { proposedWindowEnd: undefined }, /proposedWindowStart and proposedWindowEnd/],
      ['no proposer', { proposedBy: undefined }, /proposedBy/],
    ])('rejects %s as unreadable', (_name, data, message) => {
      expect(() => parseOrderEvent(bytes(change(data)))).toThrow(InvalidMessageError);
      expect(() => parseOrderEvent(bytes(change(data)))).toThrow(message);
    });
  });

  it('accepts a null courier and no reason', () => {
    const parsed = parseOrderEvent(bytes(event({}, { courierId: null, reason: undefined, status: 'ACCEPTED' })));
    expect(parsed.courierId).toBeNull();
    expect(parsed.reason).toBeNull();
  });

  it('lower-cases ids', () => {
    const parsed = parseOrderEvent(bytes(event({ eventId: ids.eventId.toUpperCase() })));
    expect(parsed.eventId).toBe(ids.eventId);
  });

  it('ignores fields it does not use, because Order owns the format', () => {
    expect(() => parseOrderEvent(bytes(event({ extra: 1 }, { extra: 2 })))).not.toThrow();
  });

  it.each([
    ['no value', null, /no value/],
    ['not JSON', bytes('not json'), /not valid JSON/],
    ['a missing event id', bytes(event({ eventId: undefined })), /eventId/],
    ['an unknown status', bytes(event({}, { status: 'LOST' })), /data\.status/],
    ['a bad order id', bytes(event({}, { orderId: 'nope' })), /data\.orderId/],
    ['a bad timestamp', bytes(event({ occurredAt: 'yesterday' })), /occurredAt/],
  ])('rejects %s as unreadable', (_name, value, message) => {
    expect(() => parseOrderEvent(value)).toThrow(InvalidMessageError);
    expect(() => parseOrderEvent(value)).toThrow(message);
  });
});

describe('peekIds', () => {
  it('finds the event id, order id and type when it can', () => {
    expect(peekIds(bytes(event({}, { status: 'LOST' })))).toEqual({
      eventId: ids.eventId,
      orderId: ids.orderId,
      type: 'OrderCancelled',
    });
  });

  it('returns nulls for an unreadable message', () => {
    expect(peekIds(bytes('not json'))).toEqual({ eventId: null, orderId: null, type: null });
  });
});

describe('parseUserEvent', () => {
  const userId = randomUUID();
  const bytes = (v: unknown) => Buffer.from(JSON.stringify(v));
  const suspended = { type: 'UserSuspended', eventId: randomUUID(), userId, occurredAt: '2026-11-04T07:00:00.000Z' };

  it('reads a UserSuspended event', () => {
    expect(parseUserEvent(bytes(suspended))).toEqual({
      eventId: suspended.eventId,
      type: 'UserSuspended',
      userId,
      occurredAt: new Date('2026-11-04T07:00:00.000Z'),
      previousStatus: null,
    });
  });

  it('reads a UserReactivated event with its previous status, ignoring extra fields', () => {
    const event = { ...suspended, type: 'UserReactivated', previousStatus: 'SUSPENDED', extra: 1 };
    expect(parseUserEvent(bytes(event))).toMatchObject({ type: 'UserReactivated', previousStatus: 'SUSPENDED' });
  });

  it('lower-cases ids', () => {
    const upper = { ...suspended, userId: userId.toUpperCase() };
    expect(parseUserEvent(bytes(upper))?.userId).toBe(userId);
  });

  it('skips the types Notification doesn’t email about', () => {
    expect(parseUserEvent(bytes({ type: 'UserRegistered', eventId: randomUUID(), userId }))).toBeNull();
  });

  it.each([
    ['not JSON', Buffer.from('nope')],
    ['no type', bytes({ eventId: randomUUID(), userId })],
    ['a UserSuspended without a user id', bytes({ ...suspended, userId: undefined })],
    ['a UserReactivated without a previous status', bytes({ ...suspended, type: 'UserReactivated' })],
    ['a UserReactivated with an unknown previous status', bytes({ ...suspended, type: 'UserReactivated', previousStatus: 'ACTIVE' })],
  ])('rejects %s', (_name, value) => {
    expect(() => parseUserEvent(value)).toThrow(InvalidMessageError);
  });

  it('peeks a user event’s id and type for the dead-letter table', () => {
    expect(peekIds(bytes(suspended))).toEqual({ eventId: suspended.eventId, orderId: null, type: 'UserSuspended' });
  });
});
