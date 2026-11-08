/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Generated the retry routing (#154), following credit-service/src/messaging/command-processor.ts:
 *        due times, header trust only on Notification's own retry topics, and the next hop.
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Works on any stream (order.events or user.events, #183); keeps the message's own key.
 * Author review: pending — Jie Yang to record the review.
 */
// AI-generated (pending review)
import { HEADER, InboundMessage, OutboundMessage } from './messages';
import { Stream } from './topics';

export function isRetryTopic(topic: string, stream: Stream): boolean {
  return stream.retries.some((r) => r.topic === topic);
}

/**
 * How long to leave a message unread before handling it. Only Notification's own retry topics carry
 * a due time, and it is never later than that topic's delay: a forged or inflated header can't pause
 * a partition for longer.
 */
export function waitBeforeProcessing(message: InboundMessage, stream: Stream, now: number): number {
  const retry = stream.retries.find((r) => r.topic === message.topic);
  if (!retry) return 0;
  const dueAt = Number(message.headers[HEADER.dueAt]);
  return Number.isFinite(dueAt) && dueAt > now ? Math.min(dueAt - now, retry.delayMs) : 0;
}

/**
 * Where an event goes after a send pass left emails that may succeed later: the stream's next retry
 * topic, or its dead-letter topic once the retries are used up. `errors` are the failure categories.
 * The clock is read by the caller after the pass, so a retry waits its full delay.
 */
export function nextHop(message: InboundMessage, stream: Stream, errors: string[], now: number): OutboundMessage {
  // Only Notification writes its retry topics; on a source topic an x-attempt header is ignored, so a
  // publisher can't skip the retries by claiming earlier attempts.
  const fromRetry = isRetryTopic(message.topic, stream);
  const attempts = (fromRetry ? Number(message.headers[HEADER.attempt]) || 0 : 0) + 1;
  const partition = fromRetry ? message.headers[HEADER.sourcePartition] : message.partition?.toString();
  const offset = fromRetry ? message.headers[HEADER.sourceOffset] : message.offset;
  const headers: Record<string, string> = {
    [HEADER.attempt]: String(attempts),
    [HEADER.error]: `Emails not sent: ${errors.join(', ')}`.slice(0, 500),
    [HEADER.errorCode]: errors[0] ?? 'UNKNOWN',
    [HEADER.sourceTopic]: stream.source,
    ...(partition !== undefined && offset !== undefined
      ? { [HEADER.sourcePartition]: partition, [HEADER.sourceOffset]: offset }
      : {}),
  };
  // The original key (orderId or userId) and bytes, so the retry keeps its entity's order (rule 5).
  const next = { key: message.key, value: message.value ?? '' };
  const retry = stream.retries[attempts - 1];
  return retry
    ? { ...next, topic: retry.topic, headers: { ...headers, [HEADER.dueAt]: String(now + retry.delayMs) } }
    : { ...next, topic: stream.deadLetter, headers: { ...headers, [HEADER.deadLetteredAt]: new Date(now).toISOString() } };
}
