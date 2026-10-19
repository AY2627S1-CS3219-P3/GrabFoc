/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
 * Scope: Generated the user.events outbox publisher (#72), following order-service's
 *        OrderEvents job. Flat event shape { type, eventId, occurredAt, userId }, which Credit's
 *        reader already accepts; chosen with Zi Yi on 2026-10-19.
 * Author review: Reviewed by Zi Yi, 2026-10-20.
 */
// AI-generated (reviewed by Zi Yi)
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { KafkaProducer } from '../infra/kafka/kafka.producer';
import { OutboxEvent, UsersRepository } from './users.repository';

/** The User Service owns this topic and its message shape (root AGENTS.md §3 Messaging, rule 3). */
export const USER_EVENTS_TOPIC = 'user.events';

const PUBLISH_INTERVAL_MS = 1000;

export interface UserEvent {
  type: string;
  /** The outbox row's id, so a resend carries the same id and consumers can drop it. */
  eventId: string;
  occurredAt: string;
  userId: string;
}

export function toUserEvent(row: OutboxEvent): UserEvent {
  return { type: row.type, eventId: row.id, occurredAt: row.occurredAt.toISOString(), userId: row.userId };
}

/**
 * Every second, publishes the unpublished user_events rows oldest first, keyed by userId, and
 * marks each once Kafka has stored it. The row is written in the same transaction as the change,
 * so nothing is lost while Kafka is down; a crash before the mark resends it with the same
 * eventId. Stops at the first failure, so one user's events never go out of order.
 */
@Injectable()
export class UserEventsPublisher implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('UserEvents');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly kafka: KafkaProducer,
    private readonly users: UsersRepository,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.publishPending(), PUBLISH_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  async publishPending(): Promise<void> {
    // A slow Kafka must not start a second run that sends the same rows alongside the first.
    if (this.running) return;
    this.running = true;
    let eventId: string | null = null;
    try {
      for (const row of await this.users.unpublishedEvents()) {
        eventId = row.id;
        await this.kafka.send(USER_EVENTS_TOPIC, row.userId, toUserEvent(row));
        await this.users.markEventPublished(row.id);
      }
    } catch {
      this.logger.warn({ event: 'USER_EVENT_PUBLISH_FAILED', eventId });
    } finally {
      this.running = false;
    }
  }
}
