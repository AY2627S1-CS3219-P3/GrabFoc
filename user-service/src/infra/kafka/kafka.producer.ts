/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
 * Scope: Copied from order-service/src/integrations/kafka.producer.ts (feat/order-service) for
 *        publishing user.events (#72); config read through ConfigService.
 * Author review: Reviewed by Zi Yi, 2026-10-20.
 */
// AI-generated (reviewed by Zi Yi)
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/env.validation';

/** The service's one Kafka connection. It never creates topics (root AGENTS.md §3 Messaging, rule 4). */
@Injectable()
export class KafkaProducer implements OnModuleInit, OnModuleDestroy {
  private producer?: KafkaJS.Producer;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async onModuleInit(): Promise<void> {
    const kafka = new KafkaJS.Kafka({
      kafkaJS: {
        clientId: 'user-service',
        brokers: this.config.get('kafkaBrokers', { infer: true }),
        logLevel: KafkaJS.logLevel.WARN,
      },
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
