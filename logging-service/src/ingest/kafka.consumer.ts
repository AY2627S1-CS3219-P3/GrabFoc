/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Generated the Kafka consumer and dead-letter producer behind the seams in consumer.ts,
 *        following credit-service/src/messaging/kafka.runner.ts and kafka.connection.ts (the same
 *        client, the same offset handling, the same dead-letter headers).
 * Author review: pending — Cole Lin to record what he checked.
 */
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { config } from '../config';
import { DeadLetters, InboundMessage, LineConsumer, MessageHandler } from './consumer';

// AI-generated (reviewed by Cole Lin).

/**
 * Headers added to a dead-lettered message, the same names Credit uses in
 * `credit-service/src/messaging/messages.ts`, so one admin screen can read every service's dead
 * letters without knowing which service wrote them.
 */
const HEADER = {
  error: 'x-error',
  sourceTopic: 'x-source-topic',
  sourcePartition: 'x-source-partition',
  sourceOffset: 'x-source-offset',
  deadLetteredAt: 'x-dead-lettered-at',
} as const;

/** One Kafka client for the consumer and the dead-letter producer. */
@Injectable()
export class KafkaIngest implements LineConsumer, DeadLetters, OnModuleDestroy {
  private readonly logger = new Logger('Kafka');
  private readonly kafka = new KafkaJS.Kafka({
    kafkaJS: {
      clientId: 'logging-service',
      brokers: config.kafkaBrokers,
      logLevel: KafkaJS.logLevel.WARN,
    },
  });

  // idempotent: a send the client retries internally must not write the message twice.
  private readonly producer = this.kafka.producer({ kafkaJS: { idempotent: true } });
  private consumer?: KafkaJS.Consumer;
  private producerReady = false;

  /**
   * Subscribes and hands each message to the handler. `eachMessage` stores the offset only after
   * the handler resolves, so a crash mid-line redelivers it rather than losing it (root AGENTS.md
   * §3, rule 2) — and `handle()` only throws for failures worth retrying.
   *
   * `fromBeginning` so a fresh group reads lines produced before this service first started;
   * duplicates from that are harmless, because the store keys on `lineId`.
   */
  async start(handler: MessageHandler): Promise<void> {
    await this.ensureTopics();
    this.consumer = this.kafka.consumer({
      kafkaJS: { groupId: config.kafkaGroupId, fromBeginning: true },
    });
    await this.consumer.connect();
    await this.consumer.subscribe({ topics: [config.kafkaTopic] });
    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) =>
        handler(toInbound(topic, partition, message)),
    });
  }

  async stop(): Promise<void> {
    await this.consumer?.disconnect();
    this.consumer = undefined;
    if (this.producerReady) {
      await this.producer.disconnect();
      this.producerReady = false;
    }
  }

  onModuleDestroy(): Promise<void> {
    return this.stop();
  }

  /**
   * Parks a message this service cannot store (Kafka rule 6). The original bytes are sent
   * unchanged: the point of a dead letter is to be able to see what actually arrived.
   */
  async send(message: InboundMessage, reason: string): Promise<void> {
    if (!this.producerReady) {
      await this.producer.connect();
      this.producerReady = true;
    }
    await this.producer.send({
      topic: config.kafkaDeadLetterTopic,
      messages: [
        {
          // Keyed by the source offset rather than the line's requestId: a dead letter may have
          // failed to parse at all, so there is no requestId to trust.
          key: message.offset ?? null,
          value: message.value,
          headers: {
            [HEADER.error]: reason,
            [HEADER.sourceTopic]: message.topic ?? config.kafkaTopic,
            [HEADER.sourcePartition]: `${message.partition ?? ''}`,
            [HEADER.sourceOffset]: message.offset ?? '',
            [HEADER.deadLetteredAt]: new Date().toISOString(),
          },
        },
      ],
    });
  }

  /**
   * `infra/kafka/topics.txt` is the single list and broker auto-creation is off (rule 4), so a
   * missing topic means that file was not updated. Say which one, at startup, instead of waiting
   * for the first line to vanish.
   */
  private async ensureTopics(): Promise<void> {
    const admin = this.kafka.admin();
    await admin.connect();
    try {
      const existing = new Set(await admin.listTopics());
      const missing = [config.kafkaTopic, config.kafkaDeadLetterTopic].filter((t) => !existing.has(t));
      if (missing.length) {
        throw new Error(
          `These topics are missing from the broker: ${missing.join(', ')}. ` +
            'Add them to infra/kafka/topics.txt and re-run the kafka-init container; services never ' +
            'create topics themselves.',
        );
      }
    } finally {
      await admin.disconnect();
    }
  }
}

/** A consumed message in the shape the ingest path expects. A repeated header keeps its last value. */
export function toInbound(
  topic: string,
  partition: number,
  message: KafkaJS.KafkaMessage,
): InboundMessage {
  return {
    topic,
    partition,
    offset: message.offset,
    value: message.value ? message.value.toString() : '',
  };
}
