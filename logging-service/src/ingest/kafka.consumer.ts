/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Generated the Kafka consumer and dead-letter producer behind the seams in consumer.ts,
 *        following credit-service/src/messaging/kafka.runner.ts and kafka.connection.ts (the same
 *        client, the same offset handling, the same dead-letter headers).
 * Author review: pending — Cole Lin to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Brought the 2026-10-21 draft up to the seam as it stands. Three things had moved under
 *        it: DeadLetters.send takes the redacted body to park rather than reading the raw message,
 *        InboundMessage carries the inbound headers, and a dead letter must keep the original
 *        x-request-id. The draft parked the raw bytes, which is what the seam was changed in
 *        review to prevent (issue #52).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Review: refuse a dead-letter topic equal to the source topic, which would republish a
 *        refused line without end, and coalesce stop() behind one promise because Nest runs the
 *        two destroy hooks that call it concurrently (issue #52).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Review: a start racing shutdown no longer leaves a consumer running that nothing can
 *        disconnect (issue #52).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Review: disconnect a consumer whose startup failed rather than leaving it for the
 *        retry to replace, and tear both clients down independently (issue #52).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Review: disconnect an admin client whose connect failed, and hold the producer's
 *        connection as a promise so shutdown can wait for one in flight (issue #52).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Review: drain the consumer before closing the producer, and refuse a producer connect
 *        once shutdown has begun, so a handler draining out cannot leave one open (issue #52).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Review: leave a consumer's teardown to whichever owner has it, and pause the partition
 *        before rethrowing so a failing dependency is not re-read in a hot loop (issue #52).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Review: refuse to schedule a pause once shutdown has begun, and disconnect the
 *        dead-letter producer even when its connect failed (issue #52).
 * Author review: Cole Lin, read and approved.
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

/**
 * The request id, carried from the inbound message onto the dead letter. A republished line that
 * loses it cannot be tied back to the request that caused it, which is the one thing this service
 * exists to make possible - so it is copied rather than regenerated (`DeadLetters` in consumer.ts).
 */
const REQUEST_ID = 'x-request-id';

/** How long a partition rests after a failure worth retrying, as in credit-service's runner. */
const ERROR_PAUSE_MS = 5000;

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
  /**
   * The producer's connection, held as the promise rather than a `ready` boolean.
   *
   * A boolean is only set *after* the connect resolves, so a SIGTERM arriving during that await
   * saw `false`, skipped the producer, and let shutdown finish - and the continuation then
   * connected it anyway, leaving a native producer alive after both destroy hooks had completed,
   * with nothing left to disconnect it. Holding the promise lets teardown wait for it (review).
   */
  private producerConnected?: Promise<void>;
  /**
   * Whether a connect was ever started. Kept when one fails, unlike `producerConnected`, which is
   * cleared so the next dead letter can retry - and clearing the only record of it meant shutdown
   * saw nothing to disconnect while the failed attempt may already hold native resources. The four
   * copied publishers were given this; this producer is the one place it was missing (review).
   */
  private producerAttempted = false;
  private stopping?: Promise<void>;
  private stopped = false;
  private readonly pauses = new Set<NodeJS.Timeout>();

  /**
   * Subscribes and hands each message to the handler. `eachMessage` stores the offset only after
   * the handler resolves, so a crash mid-line redelivers it rather than losing it (root AGENTS.md
   * §3, rule 2) — and `handle()` only throws for failures worth retrying.
   *
   * `fromBeginning` so a fresh group reads lines produced before this service first started;
   * duplicates from that are harmless, because the store keys on `lineId`.
   */
  async start(handler: MessageHandler): Promise<void> {
    // Checked after every await, because this method is slow - `ensureTopics()` connects an admin
    // client, then the consumer connects and subscribes - and a SIGTERM arriving in any of those
    // gaps runs stop() to completion while `this.consumer` is still undefined. stop() then caches
    // that finished promise, so when this resumed it built a consumer nothing could ever
    // disconnect: a client left consuming, holding native resources, after Nest had shut down.
    // The local variable matters too - assigning `this.consumer` before it is connected would let
    // stop() disconnect a half-built client (review).
    await this.ensureTopics();
    if (this.stopped) return;
    const consumer = this.kafka.consumer({
      kafkaJS: { groupId: config.kafkaGroupId, fromBeginning: true },
    });
    try {
      await consumer.connect();
    } catch (err) {
      // Connect can fail with native resources already allocated, and this client is not on
      // `this.consumer` yet, so nothing else could ever reach it.
      await consumer.disconnect().catch(() => undefined);
      throw err;
    }
    if (this.stopped) {
      await consumer.disconnect().catch(() => undefined);
      return;
    }
    this.consumer = consumer;
    // Disconnected if anything from here fails. Without this, `subscribe()` or `run()` rejecting
    // left a connected client behind, and the caller's retry built another - so a transient
    // failure accumulated clients, each one a member of the consumer group (review).
    try {
      await consumer.subscribe({ topics: [config.kafkaTopic] });
    await consumer.run({
      eachMessage: async ({ topic, partition, message, pause }) => {
        try {
          await handler(toInbound(topic, partition, message));
        } catch (err) {
          // Throwing is how the offset is left uncommitted, and it makes the client seek back -
          // so without a pause the same line is read again immediately, against the dependency
          // that just failed. `handle()` only throws for what is worth retrying (the store
          // briefly unreachable, or the dead-letter park itself failing), which is exactly the
          // case that must not become a hot loop hammering it and flooding this service's own
          // error output. Same shape as credit-service's runner (review).
          this.pauseFor(pause, ERROR_PAUSE_MS);
          this.logger.error(
            `Could not handle a message from ${topic}; trying again in ` +
              `${ERROR_PAUSE_MS / 1000}s: ${err instanceof Error ? err.message : err}`,
          );
          throw err;
        }
      },
    });
    } catch (err) {
      // Only if shutdown has not already taken this client. `disconnectAll()` clears the field and
      // then disconnects, so a stop landing while `subscribe()` or `run()` is pending owns the
      // teardown - and disconnecting here as well would be two concurrent `disconnect()` calls on
      // the same native client, which is the race the coalescing in `stop()` exists to avoid
      // (review).
      if (this.consumer === consumer) {
        this.consumer = undefined;
        await consumer.disconnect().catch(() => undefined);
      }
      throw err;
    }
    // And once more: run() resolves after the consumer is live, so a stop that landed during it
    // has already finished and would otherwise leave this one running.
    if (this.stopped) {
      await this.stop();
      return;
    }
    this.logger.log(`Consuming ${config.kafkaTopic} as ${config.kafkaGroupId}`);
  }

  /**
   * Coalesced behind one promise, because this has two callers and Nest runs destroy hooks
   * concurrently with `Promise.all`: `IngestService.onModuleDestroy` stops the consumer it was
   * given, and this class's own hook stops itself. Both would otherwise pass the checks below and
   * call `disconnect()` on the same native client at the same time, which races its teardown and
   * can reject out of an ordinary SIGTERM.
   */
  stop(): Promise<void> {
    // Set first, so a start() still working through its awaits sees it and gives up rather than
    // building a consumer this call could never reach.
    this.stopped = true;
    // Held only while it is in flight, which keeps both properties: concurrent hooks share one
    // teardown, and a later call still disconnects whatever is there now - `start()` may have
    // created a consumer after an earlier stop had already settled, and a cached finished promise
    // would have reported that one disconnected while it was still consuming.
    this.stopping ??= this.disconnectAll().finally(() => {
      this.stopping = undefined;
    });
    return this.stopping;
  }

  /**
   * Both clients, independently. A rejected `consumer.disconnect()` used to return before the
   * producer was touched, so the dead-letter producer stayed connected with its native resources
   * held while the destroy hook reported a failure - one client's bad day skipping the other's
   * cleanup entirely (review).
   */
  /**
   * Pauses this partition and resumes it after `ms`. The timer is tracked so shutdown can clear it:
   * a pending resume would otherwise hold a reference to a consumer that is being torn down.
   */
  private pauseFor(pause: () => () => void, ms: number): void {
    // Checked here, at the one place a timer is created, rather than by clearing the set again
    // after the drain. `consumer.disconnect()` waits for an in-flight handler, and that handler
    // can reject *during* the drain - its dead-letter send is refused precisely because shutdown
    // has begun - so its catch would schedule a pause after the set was emptied, and five seconds
    // later resume a consumer that no longer exists. The lesson from the three rounds before this
    // one: guard where the thing is created, not where it is tidied up (review).
    if (this.stopped) return;
    const resume = pause();
    const timer = setTimeout(() => {
      this.pauses.delete(timer);
      resume();
    }, ms);
    timer.unref();
    this.pauses.add(timer);
  }

  private async disconnectAll(): Promise<void> {
    const consumer = this.consumer;
    this.consumer = undefined;
    // A pending resume refers to a consumer that is about to be disconnected.
    for (const timer of this.pauses) clearTimeout(timer);
    this.pauses.clear();
    let failure: unknown;

    // The consumer first, and fully, before the producer is even looked at. `disconnect()` waits
    // for an in-flight `eachMessage` handler to finish, and that handler can park a dead letter -
    // so reading the producer's state before this drained could miss a connection the handler
    // opened afterwards and return with it still connected (review).
    try {
      await consumer?.disconnect();
    } catch (err) {
      failure = err;
    }

    // Only now, with nothing left that could open one. Waits for an in-flight connect before
    // disconnecting, so a producer that finished connecting during shutdown is still closed; a
    // connect that failed leaves nothing to close, which is what the rejected branch means.
    const connecting = this.producerConnected;
    const attempted = this.producerAttempted;
    this.producerConnected = undefined;
    this.producerAttempted = false;
    try {
      // Waits for a connect still in flight, then disconnects whether or not it succeeded: an
      // attempt is enough for the client to be holding something.
      await connecting?.catch(() => undefined);
      if (attempted) await this.producer.disconnect();
    } catch (err) {
      failure ??= err;
    }

    // Still reported: a teardown that could not finish is worth knowing about - but only after
    // both clients have been attempted, which is why this is sequential rather than a short
    // circuit. The first failure is enough; they are the same kind of problem.
    if (failure) throw failure;
  }

  onModuleDestroy(): Promise<void> {
    return this.stop();
  }

  /**
   * Parks a message this service will not store (Kafka rule 6).
   *
   * **`body` is what gets published, not `message.value`.** A rejected line has not been through
   * redaction, so parking the bytes that arrived would copy whatever a caller put in them into a
   * second topic - and a dead-letter topic is the one place a human goes looking, which is exactly
   * where unredacted data should not be. The caller passes a redacted copy, or `null` when the
   * bytes could not be parsed and so cannot be inspected safely; `null` is published as a
   * value-less message whose headers still say where to find the original, which Kafka keeps in
   * the source topic for its retention period (`DeadLetters` in consumer.ts).
   */
  async send(message: InboundMessage, reason: string, body: string | null): Promise<void> {
    await this.connectProducer();
    const requestId = message.headers?.[REQUEST_ID];
    await this.producer.send({
      topic: config.kafkaDeadLetterTopic,
      messages: [
        {
          // Keyed by the source offset rather than the line's requestId: a dead letter may have
          // failed to parse at all, so there is no requestId in the body to trust.
          key: message.offset ?? null,
          value: body,
          headers: {
            [HEADER.error]: reason,
            [HEADER.sourceTopic]: message.topic ?? config.kafkaTopic,
            [HEADER.sourcePartition]: `${message.partition ?? ''}`,
            [HEADER.sourceOffset]: message.offset ?? '',
            [HEADER.deadLetteredAt]: new Date().toISOString(),
            // Only when the inbound message had one: an empty header reads as "there was no
            // request", which is a different claim from "the id is unknown".
            ...(requestId ? { [REQUEST_ID]: requestId } : {}),
          },
        },
      ],
    });
  }

  /**
   * Connects once. A failed attempt is not cached, so the next dead letter tries again.
   *
   * Refused once shutdown has begun. `consumer.disconnect()` waits for an in-flight `eachMessage`
   * handler, and that handler can still try to park a dead letter - which would open a producer
   * connection in the window teardown has already passed. Refusing it rejects the handler instead,
   * which leaves the message's offset uncommitted, so the broker redelivers it on the next start:
   * the line is parked late rather than lost, and nothing is left connected (review).
   */
  private connectProducer(): Promise<void> {
    if (this.stopped) {
      return Promise.reject(
        new Error('This service is shutting down; the dead letter will be redelivered instead.'),
      );
    }
    this.producerAttempted = true;
    this.producerConnected ??= this.producer.connect().catch((err: unknown) => {
      this.producerConnected = undefined;
      throw err;
    });
    return this.producerConnected;
  }

  /**
   * `infra/kafka/topics.txt` is the single list and broker auto-creation is off (rule 4), so a
   * missing topic means that file was not updated. Say which one, at startup, instead of waiting
   * for the first line to vanish.
   */
  private async ensureTopics(): Promise<void> {
    // Before connecting anything: parking a rejected line onto the topic being consumed feeds it
    // straight back in, and a dead-letter body is not a valid log line, so it is rejected and
    // parked again, forever, growing the topic as it goes.
    if (config.kafkaTopic === config.kafkaDeadLetterTopic) {
      throw new Error(
        `LOGGING_KAFKA_TOPIC and LOGGING_KAFKA_DLT_TOPIC are both "${config.kafkaTopic}". A line ` +
          'this service refuses would be parked back onto the topic it was read from and ' +
          'republished without end; set the dead-letter topic to a different name.',
      );
    }
    const admin = this.kafka.admin();
    // The connect is inside the guard, not before it: a rejected connect never entered the
    // `finally` below, so every retry through a broker outage left another unreachable native
    // client behind - the same shape as the consumer leak one function down, in the function
    // above it (review).
    try {
      await admin.connect();
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
      // Catch: disconnecting a client that never connected is itself an error, and the failure
      // worth reporting is the one from the body.
      await admin.disconnect().catch(() => undefined);
    }
  }
}

/** A consumed message in the shape the ingest path expects. A repeated header keeps its last value. */
export function toInbound(
  topic: string,
  partition: number,
  message: KafkaJS.KafkaMessage,
): InboundMessage {
  // Carried through the seam, not dropped: the dead-letter path copies `x-request-id` from here,
  // and the draft this file came from built the message without them while its own comment said
  // otherwise. The seam gained them in review; this is that change applied.
  const headers: Record<string, string> = {};
  for (const [name, raw] of Object.entries(message.headers ?? {})) {
    const value = Array.isArray(raw) ? raw[raw.length - 1] : raw;
    if (value !== undefined && value !== null) headers[name] = value.toString();
  }
  return {
    topic,
    partition,
    offset: message.offset,
    value: message.value ? message.value.toString() : '',
    headers,
  };
}
