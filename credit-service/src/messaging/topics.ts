/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated the topic names and the retry-delay parser from spec §9.2.
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Added findTopicMismatch for the startup check (decision K10 revised to option C).
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Wrote the 2026-10-18 Author review text above from Jian Bing's account of what he checked (PR #97).
 * Author review: Jian Bing supplied what it states; the wording is Claude's.
 */

export interface RetryTopic {
  topic: string;
  delayMs: number;
}

/** The topics Credit reads and writes. All are listed in infra/kafka/topics.txt; Credit creates none. */
export interface Topics {
  userEvents: string;
  commands: string;
  /** One per retry, in order: a command's n-th failure goes to retries[n - 1]. */
  retries: RetryTopic[];
  commandsDeadLetter: string;
  userEventsDeadLetter: string;
}

/** Injection token for the Topics in use. */
export const TOPICS = Symbol('TOPICS');

const UNIT_MS: Record<string, number> = { ms: 1, s: 1000, m: 60_000 };

/** "1s,5s,30s,2m,10m" → [1000, 5000, 30000, 120000, 600000]. An empty string means no retries. */
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

/**
 * The topic names Credit uses; keep them in step with infra/kafka/topics.txt and create-topics.sh.
 * `prefix` keeps the Kafka tests' topics apart from the real ones.
 */
export function buildTopics(delaysMs: number[], prefix = ''): Topics {
  const commands = `${prefix}credit.commands`;
  return {
    userEvents: `${prefix}user.events`,
    commands,
    retries: delaysMs.map((delayMs, i) => ({ topic: `${commands}.retry.${i}`, delayMs })),
    commandsDeadLetter: `${commands}.dlt`,
    userEventsDeadLetter: `${prefix}credit.user-events.dlt`,
  };
}

/**
 * Compares the topics Credit needs with those on the broker. infra/kafka/topics.txt is the one list
 * of topics; CREDIT_RETRY_DELAYS says how long each retry waits. One retry topic per delay keeps
 * them in step, so a mismatch stops Credit with a message saying which side to fix (K10).
 * Returns null when they match. Unrelated topics (other services', Kafka's own) are ignored.
 */
export function findTopicMismatch(topics: Topics, existing: string[]): string | null {
  const present = new Set(existing);
  const needed = [
    topics.userEvents,
    topics.commands,
    ...topics.retries.map((r) => r.topic),
    topics.commandsDeadLetter,
    topics.userEventsDeadLetter,
  ];
  const missing = needed.filter((topic) => !present.has(topic));
  if (missing.length) {
    return (
      `Kafka topics missing: ${missing.join(', ')}. Add them to infra/kafka/topics.txt and run ` +
      '`docker compose up kafka-init`, or remove the extra entries from CREDIT_RETRY_DELAYS.'
    );
  }
  const retryPrefix = `${topics.commands}.retry.`;
  const extra = existing
    .filter((topic) => topic.startsWith(retryPrefix) && !topics.retries.some((r) => r.topic === topic))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (extra.length) {
    return (
      `Retry topics ${extra.join(', ')} have no matching delay in CREDIT_RETRY_DELAYS. Add a delay for each, ` +
      'or remove the topic from infra/kafka/topics.txt and delete it from Kafka.'
    );
  }
  return null;
}
