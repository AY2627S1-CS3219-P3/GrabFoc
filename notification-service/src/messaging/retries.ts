/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Generated the retry routing (#154), following credit-service/src/messaging/command-processor.ts:
 *        due times, header trust only on Notification's own retry topics, and the next hop.
 * Author review: pending — Jie Yang to record the review.
 */
// AI-generated (pending review)
import { HEADER, InboundMessage, OutboundMessage, peekIds } from './messages';
import { Topics } from './topics';

export function isRetryTopic(topic: string, topics: Topics): boolean {
  return topics.retries.some((r) => r.topic === topic);
}

/**
 * How long to leave a message unread before handling it. Only Notification's own retry topics carry
 * a due time, and it is never later than that topic's delay: a forged or inflated header can't pause
 * a partition for longer.
 */
export function waitBeforeProcessing(message: InboundMessage, topics: Topics, now: number): number {
  const retry = topics.retries.find((r) => r.topic === message.topic);
  if (!retry) return 0;
  const dueAt = Number(message.headers[HEADER.dueAt]);
  return Number.isFinite(dueAt) && dueAt > now ? Math.min(dueAt - now, retry.delayMs) : 0;
}

/**
 * Where an event goes after a send pass left emails that may succeed later: the next retry topic,
 * or the dead-letter topic once the retries are used up. `errors` are the failure categories.
 * The clock is read by the caller after the pass, so a retry waits its full delay.
 */
export function nextHop(message: InboundMessage, topics: Topics, errors: string[], now: number): OutboundMessage {
  // Only Notification writes its retry topics; on order.events an x-attempt header is ignored, so a
  // publisher can't skip the retries by claiming earlier attempts.
  const fromRetry = isRetryTopic(message.topic, topics);
  const attempts = (fromRetry ? Number(message.headers[HEADER.attempt]) || 0 : 0) + 1;
  const partition = fromRetry ? message.headers[HEADER.sourcePartition] : message.partition?.toString();
  const offset = fromRetry ? message.headers[HEADER.sourceOffset] : message.offset;
  const headers: Record<string, string> = {
    [HEADER.attempt]: String(attempts),
    [HEADER.error]: `Emails not sent: ${errors.join(', ')}`.slice(0, 500),
    [HEADER.errorCode]: errors[0] ?? 'UNKNOWN',
    [HEADER.sourceTopic]: topics.orderEvents,
    ...(partition !== undefined && offset !== undefined
      ? { [HEADER.sourcePartition]: partition, [HEADER.sourceOffset]: offset }
      : {}),
  };
  // The original bytes, keyed by the order id as Order keys them (root AGENTS.md §3 rule 5).
  const next = { key: peekIds(message.value).orderId ?? message.key, value: message.value ?? '' };
  const retry = topics.retries[attempts - 1];
  return retry
    ? { ...next, topic: retry.topic, headers: { ...headers, [HEADER.dueAt]: String(now + retry.delayMs) } }
    : {
        ...next,
        topic: topics.orderEventsDeadLetter,
        headers: { ...headers, [HEADER.deadLetteredAt]: new Date(now).toISOString() },
      };
}
