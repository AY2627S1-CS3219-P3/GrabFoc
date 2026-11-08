/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Copied from supplier-service/src/common/kafka.publisher.ts: the producer that hands
 *        this service's log lines to the Logging Service (issue #52).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Review: carry the request id in a header as well as the key, because the store's
 *        consumer drops the key and a dead letter would lose its correlation (issue #52).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Review: disconnect on shutdown even when the connect failed, since the attempt can
 *        already hold native resources (issue #52).
 * Author review: Cole Lin, read and approved.
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
  private attempted = false;

  constructor(
    private readonly topic: string,
    brokers: string[],
  ) {
    this.kafka = new KafkaJS.Kafka({
      kafkaJS: { clientId: 'user-service', brokers, logLevel: KafkaJS.logLevel.WARN },
    });
    // idempotent: a send the client retries internally must not write the line twice. The store
    // also keys on lineId, so a duplicate is harmless either way — this just avoids making them.
    this.producer = this.kafka.producer({ kafkaJS: { idempotent: true } });
  }

  async publish(lines: OutboundLine[]): Promise<void> {
    await this.connect();
    await this.producer.send({
      topic: this.topic,
      // The key is the requestId the shipper set, so one request's lines stay in one partition
      // and in the order they happened (root AGENTS.md §3, rule 5).
      //
      // And again as a header, because the key does not survive the trip: the store's consumer
      // builds its inbound message from the headers and drops the key, so a line that is later
      // dead-lettered would lose the one thing that ties it back to its request. The header is
      // the only copy the dead letter can carry.
      messages: lines.map((line) => ({
        key: line.key ?? null,
        value: line.value,
        ...(line.key ? { headers: { 'x-request-id': line.key } } : {}),
      })),
    });
  }

  /** Connects once. A failed attempt is not cached, so the next flush tries again. */
  private connect(): Promise<void> {
    if (!this.connected) {
      // `attempted` is kept even when the attempt fails, and `connected` is not: the next flush
      // has to be free to try again, but shutdown still has to close the client. A failed connect
      // can have allocated native resources already, and clearing the only marker meant `stop()`
      // saw nothing to disconnect and left that handle alive for the life of the process
      // (review).
      this.attempted = true;
      this.connected = this.producer.connect().catch((err: unknown) => {
        this.connected = undefined;
        throw err;
      });
    }
    return this.connected;
  }

  /** Called from this service's shutdown, after the shipper has flushed. */
  async stop(): Promise<void> {
    // Whether or not the connect succeeded: an attempt is enough for the client to be holding
    // something, and disconnecting one that never connected is harmless here because the failure
    // is caught and logged.
    if (!this.attempted) return;
    // Awaited first, so a connect still in flight is not disconnected from underneath.
    await this.connected?.catch(() => undefined);
    try {
      await this.producer.disconnect();
    } catch (err) {
      this.logger.warn(`Could not disconnect the log producer: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.connected = undefined;
      this.attempted = false;
    }
  }
}
