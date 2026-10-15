/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated the topic names and the retry-delay parser from spec §9.2.
 * Author review: pending — Jian Bing to record what he checked.
 */

export interface RetryTopic {
  topic: string;
  delayMs: number;
}

/** The topics Credit reads and writes. kafka-init creates them all (infra/kafka); Credit creates none. */
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
