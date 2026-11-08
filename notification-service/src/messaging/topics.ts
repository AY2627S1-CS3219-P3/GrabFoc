/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Generated the topic names and startup check (#152), following
 *        credit-service/src/messaging/topics.ts. Retry topics come with #154.
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Added the retry topics, NOTIFICATION_RETRY_DELAYS parsing and their startup check (#154),
 *        copied from credit-service/src/messaging/topics.ts.
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Grouped the topics into streams and added the user.events stream (#183).
 * Author review: pending — Jie Yang to record the review.
 */

export interface RetryTopic {
  topic: string;
  delayMs: number;
}

/** A source topic Notification consumes, with its own retry topics and dead-letter topic (rule 6). */
export interface Stream {
  source: string;
  /** One per retry, in order: an event's n-th failed send goes to retries[n - 1]. */
  retries: RetryTopic[];
  deadLetter: string;
}

/** The topics Notification reads and writes. All are listed in infra/kafka/topics.txt; Notification creates none. */
export interface Topics {
  /** order.events: emails about an order's state (#152). */
  orders: Stream;
  /** user.events: emails about the user's own account (#183). */
  users: Stream;
}

/** Injection token for the Topics in use. */
export const TOPICS = Symbol('TOPICS');

const UNIT_MS: Record<string, number> = { ms: 1, s: 1000, m: 60_000 };

/** "1s,5s,30s" → [1000, 5000, 30000]. An empty string means no retries. */
export function parseDelays(spec: string): number[] {
  if (spec.trim() === '') return [];
  return spec.split(',').map((part) => {
    const match = /^(\d+)(ms|s|m)$/.exec(part.trim());
    if (!match || Number(match[1]) <= 0) {
      throw new Error(
        `Invalid retry delay "${part.trim()}": use a positive whole number followed by ms, s or m, e.g. 30s.`,
      );
    }
    return Number(match[1]) * UNIT_MS[match[2]];
  });
}

/** `notification.<name>.retry.<n>` and `notification.<name>.dlt` (root AGENTS.md §3 Messaging, rule 6). */
function stream(source: string, name: string, delaysMs: number[], prefix: string): Stream {
  return {
    source: `${prefix}${source}`,
    retries: delaysMs.map((delayMs, i) => ({ topic: `${prefix}notification.${name}.retry.${i}`, delayMs })),
    deadLetter: `${prefix}notification.${name}.dlt`,
  };
}

/**
 * The topic names Notification uses; keep them in step with infra/kafka/topics.txt. Both streams use
 * the same delays. `prefix` keeps the Kafka tests' topics apart from the real ones.
 */
export function buildTopics(delaysMs: number[], prefix = ''): Topics {
  return {
    orders: stream('order.events', 'order-events', delaysMs, prefix),
    users: stream('user.events', 'user-events', delaysMs, prefix),
  };
}

export const streams = (topics: Topics): Stream[] => [topics.orders, topics.users];

export function allTopics(topics: Topics): string[] {
  return streams(topics).flatMap((s) => [s.source, ...s.retries.map((r) => r.topic), s.deadLetter]);
}

/** The stream a topic belongs to (its source or one of its retry topics), or undefined. */
export function streamOf(topic: string, topics: Topics): Stream | undefined {
  return streams(topics).find((s) => s.source === topic || s.retries.some((r) => r.topic === topic));
}

/**
 * Compares the topics Notification needs with those on the broker; infra/kafka/topics.txt is the
 * one list of topics. Returns null when they match. Unrelated topics are ignored, but a retry topic
 * with no delay is reported, so the list and NOTIFICATION_RETRY_DELAYS can't drift apart.
 */
export function findTopicMismatch(topics: Topics, existing: string[]): string | null {
  const present = new Set(existing);
  const missing = allTopics(topics).filter((topic) => !present.has(topic));
  if (missing.length) {
    return (
      `Kafka topics missing: ${missing.join(', ')}. Add them to infra/kafka/topics.txt and run ` +
      '`docker compose up kafka-init`, or remove the extra entries from NOTIFICATION_RETRY_DELAYS.'
    );
  }
  const extra = streams(topics)
    .flatMap((s) => {
      const retryPrefix = s.deadLetter.replace(/dlt$/, 'retry.');
      return existing.filter((topic) => topic.startsWith(retryPrefix) && !s.retries.some((r) => r.topic === topic));
    })
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (extra.length) {
    return (
      `Retry topics ${extra.join(', ')} have no matching delay in NOTIFICATION_RETRY_DELAYS. Add a delay for ` +
      'each, or remove the topic from infra/kafka/topics.txt and delete it from Kafka.'
    );
  }
  return null;
}
