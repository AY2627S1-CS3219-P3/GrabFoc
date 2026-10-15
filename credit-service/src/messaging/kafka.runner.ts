/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated the Kafka consumer for wallets from UserRegistered, with unreadable events sent
 *        to credit.user-events.dlt (spec §9.2, K11–K12).
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Phase 3: credit commands, retries and dead letters (spec §9.2, K2–K3); retry headers
 *        honoured only on retry topics (security review).
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Dead-letter the original bytes (PR #84 review) and the source position (PR #85 review);
 *        check the topics at startup (K10 revised).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { config } from '../config';
import { CreditsService } from '../credits/credits.service';
import { DeadLettersService } from '../dead-letters/dead-letters.service';
import { CommandProcessor, waitBeforeProcessing } from './command-processor';
import { KafkaConnection, toInbound } from './kafka.connection';
import { HEADER, InboundMessage, InvalidMessageError, parseUserEvent } from './messages';
import { findTopicMismatch, Topics, TOPICS } from './topics';

/** How long a partition rests after an unexpected error (e.g. the database is down). */
const ERROR_PAUSE_MS = 5000;

/** Thrown to leave a retry message unread until it is due; the client then seeks back to it. */
class NotDueYet extends Error {}

@Injectable()
export class KafkaRunner implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Kafka');
  private readonly timers = new Set<NodeJS.Timeout>();
  private readonly processor: CommandProcessor;
  private consumer?: KafkaJS.Consumer;

  constructor(
    private readonly credits: CreditsService,
    private readonly deadLetters: DeadLettersService,
    private readonly connection: KafkaConnection,
    @Inject(TOPICS) private readonly topics: Topics,
  ) {
    this.processor = new CommandProcessor(
      (command) =>
        command.type === 'TransferCredits'
          ? credits.transfer({ orderId: command.orderId, courierId: command.courierId })
          : credits.release({ orderId: command.orderId }),
      topics,
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.checkTopics();
    // fromBeginning: a new group starts at the oldest message, so no event sent before Credit
    // first started is missed. Offsets are stored only after eachMessage succeeds.
    this.consumer = this.connection.kafka.consumer({ kafkaJS: { groupId: config.kafkaGroupId, fromBeginning: true } });
    await this.consumer.connect();
    await this.consumer.subscribe({
      topics: [
        this.topics.userEvents,
        this.topics.commands,
        ...this.topics.retries.map((r) => r.topic),
        this.topics.commandsDeadLetter,
        this.topics.userEventsDeadLetter,
      ],
    });
    await this.consumer.run({ eachMessage: (payload) => this.onMessage(payload) });
    this.logger.log('Consuming user events and credit commands');
  }

  /**
   * infra/kafka/topics.txt is the one list of topics (K10); stop at startup, with a message saying
   * what to fix, if it doesn't match CREDIT_RETRY_DELAYS or lacks a topic Credit uses.
   */
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
      if (topic === this.topics.userEvents) return await this.onUserEvent(inbound);
      if (topic === this.topics.commandsDeadLetter || topic === this.topics.userEventsDeadLetter) {
        return await this.deadLetters.record(inbound);
      }

      const wait = waitBeforeProcessing(inbound, this.topics, Date.now());
      if (wait > 0) {
        // Every message in a retry topic has the same delay, so nothing behind this one is due
        // sooner: resting this partition delays no other message.
        this.pauseFor(pause, wait);
        throw new NotDueYet();
      }
      const next = await this.processor.process(inbound, Date.now());
      if (next) await this.connection.send(next);
    } catch (err) {
      if (!(err instanceof NotDueYet)) {
        this.logger.error(
          `Couldn't handle a message from ${topic}; trying again in ${ERROR_PAUSE_MS / 1000}s: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        this.pauseFor(pause, ERROR_PAUSE_MS);
      }
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
        ...(message.partition !== undefined && message.offset !== undefined
          ? { [HEADER.sourcePartition]: String(message.partition), [HEADER.sourceOffset]: message.offset }
          : {}),
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
