/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Generated the order.events parser tests (#152).
 * Author review: pending — Jie Yang to record the review.
 */
import { randomUUID } from 'crypto';
import { InvalidMessageError, parseOrderEvent, peekIds } from './messages';

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
