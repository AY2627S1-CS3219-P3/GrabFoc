/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Generated the order.events consumer (#152), following credit-service/src/messaging/kafka.runner.ts:
 *        unreadable events go to notification.order-events.dlt, which is copied into
 *        notification_dead_letters; offsets are stored only after the database write.
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Sends the event's emails after it is recorded, duplicates included (#153).
 * Author review: pending — Jie Yang to record the review.
 */
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { config } from '../config';
import { DeadLettersService } from '../dead-letters/dead-letters.service';
import { OrderEventsService } from '../events/order-events.service';
import { SenderService } from '../events/sender.service';
import { KafkaConnection, toInbound } from './kafka.connection';
import { HEADER, InboundMessage, InvalidMessageError, parseOrderEvent } from './messages';
import { allTopics, findTopicMismatch, Topics, TOPICS } from './topics';

/** How long a partition rests after an unexpected error (e.g. the database is down). */
const ERROR_PAUSE_MS = 5000;

@Injectable()
export class KafkaRunner implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Kafka');
  private readonly timers = new Set<NodeJS.Timeout>();
  private consumer?: KafkaJS.Consumer;

  constructor(
    private readonly events: OrderEventsService,
    private readonly sender: SenderService,
    private readonly deadLetters: DeadLettersService,
    private readonly connection: KafkaConnection,
    @Inject(TOPICS) private readonly topics: Topics,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.checkTopics();
    // fromBeginning: a new group starts at the oldest message, so no event sent before Notification
    // first started is missed. Offsets are stored only after eachMessage succeeds.
    this.consumer = this.connection.kafka.consumer({ kafkaJS: { groupId: config.kafkaGroupId, fromBeginning: true } });
    await this.consumer.connect();
    await this.consumer.subscribe({ topics: allTopics(this.topics) });
    await this.consumer.run({ eachMessage: (payload) => this.onMessage(payload) });
    this.logger.log('Consuming order events');
  }

  /** infra/kafka/topics.txt is the one list of topics; stop at startup if a topic is missing. */
  private async checkTopics(): Promise<void> {
    const admin = this.connection.kafka.admin();
    await admin.connect();
    try {
      const mismatch = findTopicMismatch(this.topics, await admin.listTopics());
      if (mismatch) throw new Error(mismatch);
    } finally {
      await admin.disconnect();
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const timer of this.timers) clearTimeout(timer);
    await this.consumer?.disconnect();
  }

  private async onMessage({ topic, partition, message, pause }: KafkaJS.EachMessagePayload): Promise<void> {
    const inbound = toInbound(topic, message, partition);
    try {
      if (topic === this.topics.orderEventsDeadLetter) return await this.deadLetters.record(inbound);
      await this.onOrderEvent(inbound);
    } catch (err) {
      this.logger.error(
        `Couldn't handle a message from ${topic}; trying again in ${ERROR_PAUSE_MS / 1000}s: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      this.pauseFor(pause, ERROR_PAUSE_MS);
      // Throwing makes the client seek back, so the message is read again after the pause.
      throw err;
    }
  }

  private async onOrderEvent(message: InboundMessage): Promise<void> {
    let event;
    try {
      event = parseOrderEvent(message.value);
    } catch (err) {
      if (!(err instanceof InvalidMessageError)) throw err;
      await this.deadLetter(message, err);
      return;
    }
    const outcome = await this.events.handle(event);
    // Also after a DUPLICATE: if the last delivery crashed before every email was sent, the rest are
    // sent now. The offset is stored only after this returns.
    const { sent, failed } = await this.sender.sendPending(event.eventId);
    this.logger.log(
      JSON.stringify({
        event: 'order_event_handled',
        eventId: event.eventId,
        orderId: event.orderId,
        status: event.status,
        outcome,
        sent,
        failed,
      }),
    );
  }

  /** An unreadable event can never succeed: park it on Notification's own DLT and move on. */
  private async deadLetter(message: InboundMessage, err: Error): Promise<void> {
    await this.connection.send({
      topic: this.topics.orderEventsDeadLetter,
      key: message.key,
      // The original bytes, not a UTF-8 re-encoding, so the dead letter keeps exactly what failed.
      value: message.value ?? '',
      headers: {
        [HEADER.attempt]: '1',
        [HEADER.error]: err.message.slice(0, 500),
        [HEADER.sourceTopic]: message.topic,
        ...(message.partition !== undefined && message.offset !== undefined
          ? { [HEADER.sourcePartition]: String(message.partition), [HEADER.sourceOffset]: message.offset }
          : {}),
        [HEADER.deadLetteredAt]: new Date().toISOString(),
      },
    });
    this.logger.error(JSON.stringify({ event: 'order_event_dead_lettered', reason: err.message }));
  }

  private pauseFor(pause: () => () => void, ms: number): void {
    const resume = pause();
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      resume();
    }, ms);
    this.timers.add(timer);
  }
}
