/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated the Kafka consumer for wallets from UserRegistered, with unreadable events sent
 *        to credit.user-events.dlt (spec §9.2, K11–K12).
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Dead-letter the original bytes (PR #84 review).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { config } from '../config';
import { CreditsService } from '../credits/credits.service';
import { KafkaConnection, toInbound } from './kafka.connection';
import { HEADER, InboundMessage, InvalidMessageError, parseUserEvent } from './messages';
import { Topics, TOPICS } from './topics';

/** How long a partition rests after an unexpected error (e.g. the database is down). */
const ERROR_PAUSE_MS = 5000;

@Injectable()
export class KafkaRunner implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Kafka');
  private readonly timers = new Set<NodeJS.Timeout>();
  private consumer?: KafkaJS.Consumer;

  constructor(
    private readonly credits: CreditsService,
    private readonly connection: KafkaConnection,
    @Inject(TOPICS) private readonly topics: Topics,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // fromBeginning: a new group starts at the oldest message, so no event sent before Credit
    // first started is missed. Offsets are stored only after eachMessage succeeds.
    this.consumer = this.connection.kafka.consumer({ kafkaJS: { groupId: config.kafkaGroupId, fromBeginning: true } });
    await this.consumer.connect();
    await this.consumer.subscribe({ topics: [this.topics.userEvents] });
    await this.consumer.run({ eachMessage: (payload) => this.onMessage(payload) });
    this.logger.log('Consuming user events');
  }

  async onModuleDestroy(): Promise<void> {
    for (const timer of this.timers) clearTimeout(timer);
    await this.consumer?.disconnect();
  }

  private async onMessage({ topic, message, pause }: KafkaJS.EachMessagePayload): Promise<void> {
    try {
      await this.onUserEvent(toInbound(topic, message));
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

  private async onUserEvent(message: InboundMessage): Promise<void> {
    let event;
    try {
      event = parseUserEvent(message.value);
    } catch (err) {
      if (!(err instanceof InvalidMessageError)) throw err;
      await this.deadLetterUserEvent(message, err);
      return;
    }
    if (!event) return;
    if (await this.credits.createWallet(event.userId)) {
      this.logger.log(JSON.stringify({ event: 'wallet_created', eventId: event.eventId, userId: event.userId }));
    }
  }

  /** An unreadable event can never succeed: park it on Credit's own DLT and move on (K11). */
  private async deadLetterUserEvent(message: InboundMessage, err: Error): Promise<void> {
    await this.connection.send({
      topic: this.topics.userEventsDeadLetter,
      key: message.key,
      // The original bytes, not a UTF-8 re-encoding, so the dead letter keeps exactly what failed.
      value: message.value ?? '',
      headers: {
        [HEADER.attempt]: '1',
        [HEADER.error]: err.message.slice(0, 500),
        [HEADER.sourceTopic]: message.topic,
        [HEADER.deadLetteredAt]: new Date().toISOString(),
      },
    });
    this.logger.error(JSON.stringify({ event: 'user_event_dead_lettered', reason: err.message }));
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
