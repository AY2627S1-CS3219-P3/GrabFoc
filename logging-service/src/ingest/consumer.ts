/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated the consumer seam. Cole Lin's decision on 2026-10-16 was to stub the consumer
 *        until the shared broker (#75) is merged, so this file defines the interface the real
 *        Kafka consumer will implement and nothing here depends on a Kafka client.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Added the dead-letter seam, after Cole Lin decided every service should have its own
 *        dead-letter topic as Kafka rule 6 says, rather than the exception argued before.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-23
 * Scope: After the PR #129 reviews: carry the inbound Kafka headers through the seam, and have
 *        the dead-letter sink take the body to park rather than reading the raw message.
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-28
 * Scope: State the offset-commit contract on the seam itself, rather than only in the comments of
 *        the service that depends on it (PR #129 review).
 * Author review: Cole Lin, read and approved.
 */

/** One message as it arrives, with just enough to say where a rejected line came from. */
export interface InboundMessage {
  value: string;
  topic?: string;
  partition?: number;
  offset?: string;
  /**
   * The message's own Kafka headers. Carried through the seam so a dead letter can keep the
   * original `x-request-id`: a republished message that loses it cannot be tied back to the
   * request that caused it, which is the one thing this service exists to make possible
   * (#77, #78 rely on the same header surviving Credit's retries).
   */
  headers?: Record<string, string>;
}

/**
 * What a consumer calls for each message, and the one contract an implementation has to honour.
 *
 * **Await the promise, and if it rejects, leave that message's offset uncommitted** so the broker
 * redelivers it (root AGENTS.md section 3, rule 2). A rejection never means the message is bad:
 * `IngestService.handle` counts and parks everything it can judge - unparseable bytes, a line that
 * fails validation, a line the store refuses permanently - and rethrows only what is worth
 * retrying, which is the store being briefly unreachable or the dead-letter park itself failing.
 * Catching the rejection and committing regardless drops every line written during a database
 * restart, and the only trace left is a counter (PR #129 review).
 */
export type MessageHandler = (message: InboundMessage) => Promise<void>;

/**
 * What the ingest path needs from a broker. The real implementation, once #75 lands, wraps
 * `@confluentinc/kafka-javascript` — the client Credit pinned in #85 — subscribes to
 * `config.kafkaTopic` as `config.kafkaGroupId`, and awaits the handler per message on the terms
 * `MessageHandler` sets out. Tests use an in-process fake, so the whole ingest path can be
 * exercised without a broker.
 */

// AI-generated (reviewed by Cole Lin).
export interface LineConsumer {
  start(handler: MessageHandler): Promise<void>;
  stop(): Promise<void>;
}

/** Injection token. Nothing provides it until a broker is wired in; see IngestService. */
export const LINE_CONSUMER = Symbol('LINE_CONSUMER');

/**
 * Where a line this service cannot store goes, so it is parked rather than only counted
 * (`logging.lines.dlt`, Kafka rule 6). The headers follow Credit's convention in
 * `credit-service/src/messaging/messages.ts` — `x-source-topic`, `x-source-partition`,
 * `x-source-offset`, `x-error`, `x-dead-lettered-at` — so one admin screen can read every
 * service's dead letters.
 *
 * Note what this topic holds: messages that failed validation, so their content is by definition
 * unchecked and may contain anything a producer sent. It is as sensitive as the store itself.
 */
export interface DeadLetters {
  /**
   * Parks a message this service will not store.
   *
   * `body` is what to publish, and it is **not** the raw message: a rejected line has not been
   * through redaction, so the caller passes a redacted copy, or `null` when the bytes could not be
   * parsed and so cannot be inspected safely. The raw message is still in the source topic for
   * Kafka's retention, which is where to look if the redacted copy is not enough.
   *
   * The implementation must copy the inbound `x-request-id` header onto the dead letter.
   */
  send(message: InboundMessage, reason: string, body: string | null): Promise<void>;
}

export const DEAD_LETTERS = Symbol('DEAD_LETTERS');
