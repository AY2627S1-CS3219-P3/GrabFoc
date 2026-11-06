/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Moved the Kafka producer out of credit.commands.ts so credit.commands and order.events
 *        share one connection (Phase D).
 * Author review: Reviewed
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-21
 * Scope: send() also takes a raw string and headers, for dead letters (Phase D).
 * Author review: Tested by Zi Yi (unit and compose.test.yaml integration tests), 2026-10-21.
 */
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { appConfig } from '../config';

/** Order's one Kafka connection. Order never creates topics (root AGENTS.md §3 Messaging, rule 4). */
@Injectable()
export class KafkaProducer implements OnModuleInit, OnModuleDestroy {
  private producer?: KafkaJS.Producer;

  async onModuleInit(): Promise<void> {
    const kafka = new KafkaJS.Kafka({
      kafkaJS: { clientId: 'order-service', brokers: appConfig().kafkaBrokers, logLevel: KafkaJS.logLevel.WARN },
    });
    // acks = all in-sync replicas is the default; idempotent stops a retried send writing twice.
    this.producer = kafka.producer({ kafkaJS: { idempotent: true } });
    await this.producer.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer?.disconnect();
  }

  /** Resolves once Kafka has stored the message. Kafka keeps order only per key. A string is sent as is. */
  async send(topic: string, key: string, value: object | string, headers?: Record<string, string>): Promise<void> {
    const body = typeof value === 'string' ? value : JSON.stringify(value);
    await this.producer!.send({ topic, messages: [{ key, value: body, headers }] });
  }
}
