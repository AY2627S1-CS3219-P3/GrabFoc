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
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Retry topics (#154), following credit-service/src/messaging/kafka.runner.ts: an event whose
 *        emails may still succeed moves to the next retry topic, then to the DLT; a retry message
 *        waits, with its partition paused, until it is due.
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Also consumes user.events (#183): UserSuspended and UserReactivated email the user, other
 *        types are skipped; each stream has its own retry and dead-letter topics.
 * Author review: pending — Jie Yang to record the review.
 */
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { config } from '../config';
import { DeadLettersService } from '../dead-letters/dead-letters.service';
import { AccountEmailsService } from '../events/account-emails.service';
import { OrderEventsService } from '../events/order-events.service';
import { SenderService, SendResult } from '../events/sender.service';
import { KafkaConnection, toInbound } from './kafka.connection';
import { NOT_DUE_YET } from './kafka.logger';
import { HEADER, InboundMessage, InvalidMessageError, parseOrderEvent, parseUserEvent } from './messages';
import { isRetryTopic, nextHop, waitBeforeProcessing } from './retries';
import { allTopics, findTopicMismatch, Stream, streamOf, streams, Topics, TOPICS } from './topics';

/** How long a partition rests after an unexpected error (e.g. the database is down). */
const ERROR_PAUSE_MS = 5000;

/** Thrown to leave a retry message unread until it is due; the client then seeks back to it. */
class NotDueYet extends Error {
  constructor() {
    super(NOT_DUE_YET);
  }
}

/** What a handler did with one event, for the log line and the retry routing. */
interface Handled {
  /** Ids for the log line; never an email address. */
  ids: Record<string, string>;
  outcome: string;
  result: SendResult;
}

@Injectable()
export class KafkaRunner implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Kafka');
  private readonly timers = new Set<NodeJS.Timeout>();
  private consumer?: KafkaJS.Consumer;

  constructor(
    private readonly events: OrderEventsService,
    private readonly sender: SenderService,
    private readonly accountEmails: AccountEmailsService,
    private readonly deadLetters: DeadLettersService,
    private readonly connection: KafkaConnection,
    @Inject(TOPICS) private readonly topics: Topics,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.checkTopics();
    // fromBeginning: a new group starts at the oldest message, so no event sent before Notification
    // first started is missed. Offsets are stored only after eachMessage succeeds. For user.events this
    // reads its whole history once; account events over an hour old are recorded but not emailed.
    this.consumer = this.connection.kafka.consumer({ kafkaJS: { groupId: config.kafkaGroupId, fromBeginning: true } });
    await this.consumer.connect();
    await this.consumer.subscribe({ topics: allTopics(this.topics) });
    await this.consumer.run({ eachMessage: (payload) => this.onMessage(payload) });
    this.logger.log('Consuming order and user events');
  }

  /**
   * infra/kafka/topics.txt is the one list of topics; stop at startup if a topic is missing or the
   * retry topics don't match NOTIFICATION_RETRY_DELAYS.
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
      if (streams(this.topics).some((s) => s.deadLetter === topic)) return await this.deadLetters.record(inbound);
      const stream = streamOf(topic, this.topics);
      if (!stream) return;
      const wait = waitBeforeProcessing(inbound, stream, Date.now());
      if (wait > 0) {
        // Every message in a retry topic has the same delay, so nothing behind this one is due
        // sooner: resting this partition delays no other message.
        this.pauseFor(pause, wait);
        throw new NotDueYet();
      }
      await this.onEvent(inbound, stream);
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

  /** An event from a source topic, or one of its retries. */
  private async onEvent(message: InboundMessage, stream: Stream): Promise<void> {
    const retry = isRetryTopic(message.topic, stream);
    let handled: Handled | null;
    try {
      handled =
        stream === this.topics.orders ? await this.onOrderEvent(message, retry) : await this.onUserEvent(message, retry);
    } catch (err) {
      if (!(err instanceof InvalidMessageError)) throw err;
      await this.deadLetter(message, stream, err);
      return;
    }
    if (!handled) return;
    const { ids, outcome, result } = handled;
    // Before the offset is stored, so a crash here sends the event on again; a retry only sends
    // emails still FAILED, so the extra copy changes nothing.
    const next = result.retryable.length ? nextHop(message, stream, result.retryable, Date.now()) : null;
    if (next) await this.connection.send(next);
    this.logger.log(
      JSON.stringify({
        event: stream === this.topics.orders ? 'order_event_handled' : 'user_event_handled',
        ...ids,
        outcome,
        sent: result.sent,
        failed: result.failed,
        superseded: result.superseded,
        retryable: result.retryable.length,
        ...(next ? { next: next.topic } : {}),
      }),
    );
    if (next?.topic === stream.deadLetter) {
      this.logger.error(JSON.stringify({ event: 'event_dead_lettered', ...ids, reason: 'retries used up' }));
    }
  }

  private async onOrderEvent(message: InboundMessage, retry: boolean): Promise<Handled> {
    const event = parseOrderEvent(message.value);
    const ids = { eventId: event.eventId, orderId: event.orderId, status: event.status };
    if (retry) {
      // Already recorded when it first arrived; only its failed emails are sent again.
      return { ids, outcome: 'RETRY', result: await this.sender.retryFailed(event.eventId) };
    }
    const outcome = await this.events.handle(event);
    // Also after a DUPLICATE: if the last delivery crashed before every email was sent, the rest are
    // sent now.
    return { ids, outcome, result: await this.sender.sendPending(event.eventId) };
  }

  /** null for a user.events type Notification doesn't email about (e.g. UserRegistered). */
  private async onUserEvent(message: InboundMessage, retry: boolean): Promise<Handled | null> {
    const event = parseUserEvent(message.value);
    if (!event) return null;
    const ids = { eventId: event.eventId, userId: event.userId, type: event.type };
    if (retry) return { ids, outcome: 'RETRY', result: await this.accountEmails.retryFailed(event.eventId) };
    const outcome = await this.accountEmails.record(event);
    return { ids, outcome, result: await this.accountEmails.sendPending(event.eventId) };
  }

  /** An unreadable event can never succeed: park it on its stream's own DLT and move on. */
  private async deadLetter(message: InboundMessage, stream: Stream, err: Error): Promise<void> {
    await this.connection.send({
      topic: stream.deadLetter,
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
    this.logger.error(JSON.stringify({ event: 'event_dead_lettered', topic: message.topic, reason: err.message }));
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
