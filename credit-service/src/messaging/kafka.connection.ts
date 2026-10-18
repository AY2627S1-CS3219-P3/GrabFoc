/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated the Kafka client and producer (spec §9.2: @confluentinc/kafka-javascript).
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: toInbound keeps the message's partition and offset (PR #85 review).
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: The client logs through kafkaLogger (quieter logs).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { config } from '../config';
import { kafkaLogger } from './kafka.logger';
import { InboundMessage, OutboundMessage, Publisher } from './messages';

@Injectable()
export class KafkaConnection implements Publisher, OnModuleInit, OnModuleDestroy {
  readonly kafka = new KafkaJS.Kafka({
    kafkaJS: {
      clientId: 'credit-service',
      brokers: config.kafkaBrokers,
      logger: kafkaLogger(),
      logLevel: KafkaJS.logLevel.WARN,
    },
  });

  // acks = all in-sync replicas is the default; idempotent stops a retried send writing twice.
  private readonly producer = this.kafka.producer({ kafkaJS: { idempotent: true } });

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
  }

  async send({ topic, key, value, headers }: OutboundMessage): Promise<void> {
    await this.producer.send({ topic, messages: [{ key, value, headers }] });
  }
}

/** Converts a consumed message to Credit's own shape; a repeated header keeps its last value. */
export function toInbound(topic: string, message: KafkaJS.KafkaMessage, partition?: number): InboundMessage {
  const headers: Record<string, string> = {};
  for (const [name, raw] of Object.entries(message.headers ?? {})) {
    const value = Array.isArray(raw) ? raw[raw.length - 1] : raw;
    if (value !== undefined) headers[name] = value.toString();
  }
  return {
    topic,
    partition,
    offset: message.offset,
    key: message.key ? message.key.toString() : null,
    value: message.value ?? null,
    headers,
  };
}
