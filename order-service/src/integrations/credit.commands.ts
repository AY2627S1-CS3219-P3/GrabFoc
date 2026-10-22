/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-17
 * Scope: Generated the Kafka producer for Credit's TransferCredits / ReleaseCredits commands
 *        (Phase D), matching the contract in credit-service/AGENTS.md "Messaging".
 * Author review: Reviewed
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Sends through the shared KafkaProducer instead of its own connection.
 * Author review: Reviewed
 */
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { KafkaProducer } from './kafka.producer';

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
export class CreditCommands {
  constructor(private readonly kafka: KafkaProducer) {}

  transfer(orderId: string, courierId: string): Promise<void> {
    return this.send({ type: 'TransferCredits', eventId: randomUUID(), orderId, courierId });
  }

  release(orderId: string): Promise<void> {
    return this.send({ type: 'ReleaseCredits', eventId: randomUUID(), orderId });
  }

  /** Keyed by orderId: Credit refuses any other key. */
  private send(command: CreditCommand): Promise<void> {
    return this.kafka.send(CREDIT_COMMANDS_TOPIC, command.orderId, command);
  }
}
