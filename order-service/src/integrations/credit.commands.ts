/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-17
 * Scope: Generated the Kafka producer for Credit's TransferCredits / ReleaseCredits commands
 *        (Phase D), matching the contract in credit-service/AGENTS.md "Messaging".
 * Author review: Reviewed
 */
import { randomUUID } from 'node:crypto';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { appConfig } from '../config';

/** Credit owns this topic and the command shapes; it rejects unknown fields. */
export const CREDIT_COMMANDS_TOPIC = 'credit.commands';

export type CreditCommand =
  | { type: 'TransferCredits'; eventId: string; orderId: string; courierId: string }
  | { type: 'ReleaseCredits'; eventId: string; orderId: string };

/**
 * Sends settlement commands to Credit. A send resolves once Kafka has stored the message; Credit
 * handles a repeat as a no-op, so resending after a crash is safe.
 */
@Injectable()
export class CreditCommands implements OnModuleInit, OnModuleDestroy {
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

  transfer(orderId: string, courierId: string): Promise<void> {
    return this.send({ type: 'TransferCredits', eventId: randomUUID(), orderId, courierId });
  }

  release(orderId: string): Promise<void> {
    return this.send({ type: 'ReleaseCredits', eventId: randomUUID(), orderId });
  }

  /** Keyed by orderId: Credit refuses any other key, and Kafka keeps order only per key. */
  protected async send(command: CreditCommand): Promise<void> {
    await this.producer!.send({
      topic: CREDIT_COMMANDS_TOPIC,
      messages: [{ key: command.orderId, value: JSON.stringify(command) }],
    });
  }
}
