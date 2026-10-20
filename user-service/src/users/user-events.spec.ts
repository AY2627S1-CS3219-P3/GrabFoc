/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
 * Scope: Generated the tests for the UserRegistered builder.
 * Author review: pending — Deanson to record what he checked.
 */
// AI-generated (reviewed by Deanson)
import { describe, expect, it } from 'vitest';
import { USER_EVENTS_TOPIC, userRegistered } from './user-events';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('userRegistered', () => {
  const user = { id: '3f0c2a9e-1b7d-4c55-9a51-0d6c1e2b7f10', createdAt: new Date('2026-10-19T08:00:00.000Z') };

  it('builds the payload the Credit Service reads, keyed by the user', () => {
    const event = userRegistered(user);

    expect(event).toMatchObject({ aggregateId: user.id, eventType: 'UserRegistered', topic: USER_EVENTS_TOPIC });
    expect(event.topic).toBe('user.events');
    expect(event.payload).toEqual({
      type: 'UserRegistered',
      eventId: event.id,
      userId: user.id,
      occurredAt: '2026-10-19T08:00:00.000Z',
    });
    expect(event.id).toMatch(UUID);
  });

  it('carries no personal data, only these four fields', () => {
    const withPersonalData = { ...user, displayName: 'Alex', emailEncrypted: Buffer.from('x') };
    expect(Object.keys(userRegistered(withPersonalData).payload).sort()).toEqual([
      'eventId',
      'occurredAt',
      'type',
      'userId',
    ]);
  });

  it('gives every event its own id', () => {
    expect(userRegistered(user).id).not.toBe(userRegistered(user).id);
  });
});
