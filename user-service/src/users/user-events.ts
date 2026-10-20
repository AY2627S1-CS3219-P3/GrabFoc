/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
 * Scope: Generated the UserRegistered builder from Deanson's payload ({ type, eventId, userId, occurredAt }).
 * Author review: pending — Deanson to record what he checked.
 */
// AI-generated (reviewed by Deanson)
import { randomUUID } from 'crypto';
import type { OutboxEvent } from '../infra/outbox/outbox.repository';
import type { UserRecord } from './users.repository';

/** The User Service owns this topic and its message shapes (user-service/AGENTS.md, "Events"). */
export const USER_EVENTS_TOPIC = 'user.events';

/**
 * Sent once per account: on sign-up verification and for the bootstrap admin. Ids and a
 * timestamp only, never personal data (NFR5.1). The Credit Service creates the wallet from it.
 */
export function userRegistered(user: Pick<UserRecord, 'id' | 'createdAt'>): OutboxEvent {
  const eventId = randomUUID();
  return {
    id: eventId,
    aggregateId: user.id,
    eventType: 'UserRegistered',
    topic: USER_EVENTS_TOPIC,
    payload: {
      type: 'UserRegistered',
      eventId,
      userId: user.id,
      occurredAt: user.createdAt.toISOString(),
    },
  };
}
