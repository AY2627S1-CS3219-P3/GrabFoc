/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
 * Scope: Generated the Publisher interface and its Kafka implementation, following
 *        credit-service/src/messaging/kafka.connection.ts (issue #120).
 * Author review: pending — Jie Yang to record what he checked.
 */
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { OnModuleDestroy } from '@nestjs/common';

export interface OutboundMessage {
  topic: string;
  key: string;
  value: string;
}

export interface Publisher {
  send(message: OutboundMessage): Promise<void>;
}

/** Injection token for the Publisher: Kafka in the app, null when no brokers are configured. */
export const PUBLISHER = Symbol('PUBLISHER');

export class KafkaPublisher implements Publisher, OnModuleDestroy {
  private readonly kafka: KafkaJS.Kafka;
  // acks = all in-sync replicas is the default; idempotent stops a retried send writing twice.
  private readonly producer: KafkaJS.Producer;
  private connected?: Promise<void>;

  constructor(brokers: string[]) {
    this.kafka = new KafkaJS.Kafka({
      kafkaJS: { clientId: 'supplier-service', brokers, logLevel: KafkaJS.logLevel.WARN },
    });
    this.producer = this.kafka.producer({ kafkaJS: { idempotent: true } });
  }

  // Connects on the first send rather than at startup, so the service starts and serves requests
  // while Kafka is down; events wait in supplier_outbox until a send succeeds.
  async send({ topic, key, value }: OutboundMessage): Promise<void> {
    this.connected ??= this.producer.connect().catch((err) => {
      this.connected = undefined; // try again on the next send
      throw err;
    });
    await this.connected;
    await this.producer.send({ topic, messages: [{ key, value }] });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connected) await this.producer.disconnect().catch(() => undefined);
  }
}
