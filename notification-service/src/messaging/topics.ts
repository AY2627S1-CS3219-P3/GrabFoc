/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Generated the topic names and startup check (#152), following
 *        credit-service/src/messaging/topics.ts. Retry topics come with #154.
 * Author review: pending — Jie Yang to record the review.
 */

/** The topics Notification reads and writes. All are listed in infra/kafka/topics.txt; Notification creates none. */
export interface Topics {
  orderEvents: string;
  /** Notification's own dead-letter topic for order.events (root AGENTS.md §3 Messaging, rule 6). */
  orderEventsDeadLetter: string;
}

/** Injection token for the Topics in use. */
export const TOPICS = Symbol('TOPICS');

/**
 * The topic names Notification uses; keep them in step with infra/kafka/topics.txt.
 * `prefix` keeps the Kafka tests' topics apart from the real ones.
 */
export function buildTopics(prefix = ''): Topics {
  return {
    orderEvents: `${prefix}order.events`,
    orderEventsDeadLetter: `${prefix}notification.order-events.dlt`,
  };
}

export function allTopics(topics: Topics): string[] {
  return [topics.orderEvents, topics.orderEventsDeadLetter];
}

/**
 * Compares the topics Notification needs with those on the broker; infra/kafka/topics.txt is the
 * one list of topics. Returns null when none is missing. Unrelated topics are ignored.
 */
export function findTopicMismatch(topics: Topics, existing: string[]): string | null {
  const present = new Set(existing);
  const missing = allTopics(topics).filter((topic) => !present.has(topic));
  if (!missing.length) return null;
  return (
    `Kafka topics missing: ${missing.join(', ')}. Add them to infra/kafka/topics.txt and run ` +
    '`docker compose up kafka-init`.'
  );
}
