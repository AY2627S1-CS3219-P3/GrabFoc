/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
 * Scope: Generated the lazy, idempotent Kafka producer for the outbox relay (Deanson's design:
 *   10 s delivery timeout, connect timeout, discarded after any failure).
 * Author review: pending — Deanson to record what he checked.
 */
// AI-generated (reviewed by Deanson)
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/env.validation';
import type { PendingEvent } from '../outbox/outbox.repository';

/** How long the client keeps trying to deliver a message before failing the send. */
const MESSAGE_TIMEOUT_MS = 10_000;
/**
 * One connect attempt waits for TCP setup + authentication + 1 s, so about 6 s here. The
 * client's defaults (1 s + 10 s, retried 5 times with backoff) held a tick, and its database
 * transaction, for about 95 s with Kafka down.
 */
const CONNECT_TIMEOUT_MS = 3_000;
const AUTHENTICATION_TIMEOUT_MS = 2_000;
/** librdkafka's own delivery retries inside MESSAGE_TIMEOUT_MS; kept at the client's default. */
const MESSAGE_RETRIES = 5;

/**
 * Sends the client's own log lines to Nest at debug level (shown with LOG_LEVEL=debug). Every
 * failure already reaches the relay's reportRelayFailure, and with Kafka down librdkafka logs a
 * reconnect error every few hundred milliseconds, which would bury everything else.
 */
function debugLogger(nest = new Logger('Kafka')): KafkaJS.Logger {
  const write = (message: unknown, extra?: object) =>
    nest.debug(`${typeof message === 'string' ? message : JSON.stringify(message)}${extra ? ` ${JSON.stringify(extra)}` : ''}`);
  const logger: KafkaJS.Logger = {
    info: write,
    warn: write,
    error: write,
    debug: write,
    namespace: () => logger,
    setLogLevel: () => undefined,
  };
  return logger;
}

/**
 * The only Kafka client in the service. It connects on first use, not at startup, so the
 * service boots with Kafka down. The service never creates topics (root AGENTS.md §3, rule 4).
 */
@Injectable()
export class KafkaProducer {
  private readonly kafka: KafkaJS.Kafka;
  private producer?: KafkaJS.Producer;

  constructor(config: ConfigService<AppConfig, true>) {
    this.kafka = new KafkaJS.Kafka({
      kafkaJS: {
        clientId: 'user-service',
        brokers: config.get('kafkaBrokers', { infer: true }),
        connectionTimeout: CONNECT_TIMEOUT_MS,
        authenticationTimeout: AUTHENTICATION_TIMEOUT_MS,
        logLevel: KafkaJS.logLevel.WARN,
        logger: debugLogger(),
      },
    });
  }

  /** Sends every event in one request, keyed by its aggregate id, to each event's own topic. */
  async sendBatch(events: PendingEvent[]): Promise<void> {
    const byTopic = new Map<string, { key: string; value: string }[]>();
    for (const event of events) {
      const messages = byTopic.get(event.topic) ?? [];
      messages.push({ key: event.aggregateId, value: JSON.stringify(event.payload) });
      byTopic.set(event.topic, messages);
    }
    const producer = await this.connected();
    await producer.sendBatch({
      topicMessages: [...byTopic].map(([topic, messages]) => ({ topic, messages })),
    });
  }

  /**
   * Throws the producer away. An idempotent producer can hit errors it never recovers from,
   * so after any failure the next send starts with a fresh one.
   */
  async reset(): Promise<void> {
    const producer = this.producer;
    this.producer = undefined;
    await producer?.disconnect().catch(() => undefined);
  }

  private async connected(): Promise<KafkaJS.Producer> {
    if (this.producer) return this.producer;
    const producer = this.kafka.producer({
      // Idempotent: the client's own retries never write a message twice. acks = all replicas.
      // retries: 0 is one connect attempt per tick; the relay's backoff does the retrying.
      kafkaJS: { idempotent: true, acks: -1, retry: { retries: 0 } },
      // The kafkaJS `retry` above would also set delivery retries to 0; this keeps them.
      retries: MESSAGE_RETRIES,
      'message.timeout.ms': MESSAGE_TIMEOUT_MS,
    });
    try {
      await producer.connect();
    } catch (error) {
      // Never keep a half-open client around.
      await producer.disconnect().catch(() => undefined);
      throw error;
    }
    this.producer = producer;
    return producer;
  }
}
