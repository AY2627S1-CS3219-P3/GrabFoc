/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated unit tests for the command parser (strict) and the UserRegistered reader
 *        (tolerant, decision K12).
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Added the upper-case id test (PR #85 review).
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
 */
import { randomUUID } from 'crypto';
import { InvalidMessageError, parseCommand, parseUserEvent, peekIds } from './messages';

const json = (value: unknown) => Buffer.from(JSON.stringify(value));
const eventId = randomUUID();
const orderId = randomUUID();
const userId = randomUUID();

describe('parseCommand', () => {
  it('reads a transfer', () => {
    const courierId = randomUUID();
    expect(parseCommand(json({ type: 'TransferCredits', eventId, orderId, courierId }))).toEqual({
      type: 'TransferCredits',
      eventId,
      orderId,
      courierId,
    });
  });

  it('reads a release', () => {
    expect(parseCommand(json({ type: 'ReleaseCredits', eventId, orderId }))).toEqual({
      type: 'ReleaseCredits',
      eventId,
      orderId,
    });
  });

  // PR #85 review: PostgreSQL returns UUIDs in lower case, so a repeat in upper case must match.
  it('lower-cases every id, so a repeated command in upper case still matches the stored hold', () => {
    const courierId = randomUUID();
    expect(
      parseCommand(
        json({
          type: 'TransferCredits',
          eventId: eventId.toUpperCase(),
          orderId: orderId.toUpperCase(),
          courierId: courierId.toUpperCase(),
        }),
      ),
    ).toEqual({ type: 'TransferCredits', eventId, orderId, courierId });
  });

  it('rejects unknown fields, because Credit owns this contract', () => {
    expect(() => parseCommand(json({ type: 'ReleaseCredits', eventId, orderId, amount: 5 }))).toThrow(
      InvalidMessageError,
    );
  });

  it('rejects an unknown type', () => {
    expect(() => parseCommand(json({ type: 'RefundCredits', eventId, orderId }))).toThrow(InvalidMessageError);
  });

  it('rejects a value that is not JSON', () => {
    expect(() => parseCommand(Buffer.from('not json'))).toThrow(/not valid JSON/);
  });

  it('rejects an empty message', () => {
    expect(() => parseCommand(null)).toThrow(InvalidMessageError);
  });
});

describe('parseUserEvent (tolerant reader)', () => {
  it('reads the user id and event id', () => {
    expect(
      parseUserEvent(json({ type: 'UserRegistered', eventId, userId, occurredAt: '2026-10-15T10:00:00Z' })),
    ).toEqual({ userId, eventId });
  });

  it('needs nothing but the user id: no occurredAt, extra fields and a bad event id are fine', () => {
    expect(parseUserEvent(json({ type: 'UserRegistered', userId, eventId: 'evt-1', email: 'x@u.nus.edu' }))).toEqual({
      userId,
      eventId: null,
    });
  });

  it('lower-cases the user id', () => {
    expect(parseUserEvent(json({ type: 'UserRegistered', userId: userId.toUpperCase() }))?.userId).toBe(userId);
  });

  it('ignores other event types on the topic', () => {
    expect(parseUserEvent(json({ type: 'UserSuspended', userId }))).toBeNull();
  });

  it('rejects a UserRegistered without a valid user id', () => {
    expect(() => parseUserEvent(json({ type: 'UserRegistered', userId: 'nope' }))).toThrow(InvalidMessageError);
  });

  it('rejects a value that is not a JSON object', () => {
    expect(() => parseUserEvent(Buffer.from('not json'))).toThrow(InvalidMessageError);
    expect(() => parseUserEvent(json([1, 2]))).toThrow(InvalidMessageError);
  });
});

describe('peekIds', () => {
  it('reads ids from a valid command, lower-cased', () => {
    expect(peekIds(json({ type: 'ReleaseCredits', eventId: eventId.toUpperCase(), orderId }))).toEqual({
      eventId,
      orderId,
      type: 'ReleaseCredits',
    });
  });

  it('returns nulls for a message it can’t read', () => {
    expect(peekIds(Buffer.from('not json'))).toEqual({ eventId: null, orderId: null, type: null });
  });

  it('drops ids that aren’t UUIDs', () => {
    expect(peekIds(json({ type: 'ReleaseCredits', eventId: '1', orderId: 'x' }))).toEqual({
      eventId: null,
      orderId: null,
      type: 'ReleaseCredits',
    });
  });
});
