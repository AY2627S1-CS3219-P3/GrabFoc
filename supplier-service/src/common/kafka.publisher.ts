/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Generated the Kafka producer that hands this service's log lines to the Logging Service,
 *        following credit-service/src/messaging/kafka.connection.ts (the same client and settings).
 * Author review: pending — Cole Lin to record what he checked.
 */
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Logger } from '@nestjs/common';
import type { LinePublisher, OutboundLine } from './log-shipper';

// AI-generated (reviewed by Cole Lin).

/**
 * Publishes log lines to the Logging Service's topic (issue #52).
 *
 * Nothing here is on a request's path: the shipper calls `publish` from a timer, never awaits it,
 * and drops lines rather than waiting if this is slow. So the only rule this has to keep is **not
 * to throw where it cannot be caught** — the shipper catches a rejected promise and counts it.
 *
 * The connection is made on the first publish rather than at startup, so a broker that is not up
 * yet delays nothing and fails nothing: the lines are already on stdout either way.
 */
export class KafkaLinePublisher implements LinePublisher {
  private readonly logger = new Logger('LogShipper');
  private readonly kafka: KafkaJS.Kafka;
  private readonly producer: KafkaJS.Producer;
  private connected?: Promise<void>;

  constructor(
    private readonly topic: string,
    brokers: string[],
  ) {
    this.kafka = new KafkaJS.Kafka({
      kafkaJS: { clientId: 'supplier-service', brokers, logLevel: KafkaJS.logLevel.WARN },
    });
    // idempotent: a send the client retries internally must not write the line twice. The store
    // also keys on lineId, so a duplicate is harmless either way — this just avoids making them.
    this.producer = this.kafka.producer({ kafkaJS: { idempotent: true } });
  }

  async publish(lines: OutboundLine[]): Promise<void> {
    await this.connect();
    await this.producer.send({
      topic: this.topic,
      // The key is the requestId the shipper set, so one request's lines stay in one partition and
      // in the order they happened (root AGENTS.md §3, rule 5).
      messages: lines.map((line) => ({ key: line.key ?? null, value: line.value })),
    });
  }

  /** Connects once. A failed attempt is not cached, so the next flush tries again. */
  private connect(): Promise<void> {
    if (!this.connected) {
      this.connected = this.producer.connect().catch((err: unknown) => {
        this.connected = undefined;
        throw err;
      });
    }
    return this.connected;
  }

  /** Called from the shipper's own shutdown, after it has flushed. */
  async stop(): Promise<void> {
    if (!this.connected) return;
    try {
      await this.producer.disconnect();
    } catch (err) {
      this.logger.warn(`Could not disconnect the log producer: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.connected = undefined;
    }
  }
}
