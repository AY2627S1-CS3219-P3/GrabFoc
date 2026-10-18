/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Moved the Kafka producer out of credit.commands.ts so credit.commands and order.events
 *        share one connection (Phase D).
 * Author review: Pending review by Zi Yi.
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

  /** Resolves once Kafka has stored the message. Kafka keeps order only per key. */
  async send(topic: string, key: string, value: object): Promise<void> {
    await this.producer!.send({ topic, messages: [{ key, value: JSON.stringify(value) }] });
  }
}
