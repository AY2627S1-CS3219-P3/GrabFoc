/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated the consumer seam. Cole Lin's decision on 2026-10-16 was to stub the consumer
 *        until the shared broker (#75) is merged, so this file defines the interface the real
 *        Kafka consumer will implement and nothing here depends on a Kafka client.
 * Author review: pending — Cole Lin to record what he checked.
 */

/** One message as it arrives, with just enough to say where a rejected line came from. */
export interface InboundMessage {
  value: string;
  topic?: string;
  partition?: number;
  offset?: string;
}

export type MessageHandler = (message: InboundMessage) => Promise<void>;

/**
 * What the ingest path needs from a broker. The real implementation, once #75 lands, wraps
 * `@confluentinc/kafka-javascript` — the client Credit pinned in #85 — subscribes to
 * `config.kafkaTopic` as `config.kafkaGroupId`, and calls the handler per message. Tests use an
 * in-process fake, so the whole ingest path can be exercised without a broker.
 */
export interface LineConsumer {
  start(handler: MessageHandler): Promise<void>;
  stop(): Promise<void>;
}

/** Injection token. Nothing provides it until #75; see IngestService for what happens then. */
export const LINE_CONSUMER = Symbol('LINE_CONSUMER');
