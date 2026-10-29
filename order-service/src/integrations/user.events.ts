/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-21
 * Scope: Generated the user.events consumer (Phase D): UserSuspended cancels the user's unfinished
 *        orders; unreadable events go to order.user-events.dlt. Consumer group and dead-letter
 *        handling as Zi Yi approved on 2026-10-21.
 * Author review: Tested by Zi Yi (unit and compose.test.yaml integration tests), 2026-10-21.
 */
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { z } from 'zod';
import { appConfig } from '../config';
import { OrdersService } from '../orders/orders.service';
import { KafkaProducer } from './kafka.producer';

/** The User Service owns this topic and the event shapes (user-service/AGENTS.md "Events"). */
export const USER_EVENTS_TOPIC = 'user.events';
/** Order's own dead-letter topic for it (root AGENTS.md §3 Messaging, rule 6). */
export const USER_EVENTS_DLT = 'order.user-events.dlt';
const GROUP_ID = 'order-service';
const RETRY_PAUSE_MS = 5000;

// Not strict: the owner may add fields, and Order reads only these.
const userSuspendedSchema = z.object({
  type: z.literal('UserSuspended'),
  eventId: z.string().uuid(),
  userId: z.string().uuid(),
});

export class InvalidUserEvent extends Error {}

/** The suspended user's ID; null for event types Order doesn't handle (e.g. UserRegistered). */
export function parseUserEvent(value: string | undefined): { eventId: string; userId: string } | null {
  let json: unknown;
  try {
    json = JSON.parse(value ?? '');
  } catch {
    throw new InvalidUserEvent('The message is not JSON.');
  }
  if (typeof json !== 'object' || json === null || typeof (json as { type?: unknown }).type !== 'string') {
    throw new InvalidUserEvent('The message has no type.');
  }
  if ((json as { type: string }).type !== 'UserSuspended') return null;
  const result = userSuspendedSchema.safeParse(json);
  if (!result.success) throw new InvalidUserEvent('Invalid UserSuspended event.');
  return { eventId: result.data.eventId, userId: result.data.userId.toLowerCase() };
}

const logger = new Logger('Order');

/**
 * Consumes user.events. main.ts calls start(); tests call handle() directly. An offset is stored
 * only after handle() returns, so a crash redelivers the event (rule 2). Any other failure (e.g. the
 * database is down) pauses the partition and retries the same event: a valid suspension is never
 * skipped.
 */
@Injectable()
export class UserEvents implements OnModuleDestroy {
  private consumer?: KafkaJS.Consumer;

  constructor(
    private readonly orders: OrdersService,
    private readonly kafka: KafkaProducer,
  ) {}

  async start(): Promise<void> {
    const kafka = new KafkaJS.Kafka({
      kafkaJS: { clientId: 'order-service', brokers: appConfig().kafkaBrokers, logLevel: KafkaJS.logLevel.WARN },
    });
    // fromBeginning: a new group starts at the oldest message, so no suspension sent before Order first ran is missed.
    this.consumer = kafka.consumer({ kafkaJS: { groupId: GROUP_ID, fromBeginning: true } });
    await this.consumer.connect();
    await this.consumer.subscribe({ topics: [USER_EVENTS_TOPIC] });
    await this.consumer.run({
      eachMessage: async ({ message, pause }) => {
        try {
          await this.handle({ key: message.key?.toString(), value: message.value?.toString() });
        } catch (error) {
          logger.warn(JSON.stringify({ event: 'USER_EVENT_FAILED', error: String(error) }));
          const resume = pause();
          setTimeout(resume, RETRY_PAUSE_MS).unref();
          throw error; // the client seeks back, so the event is read again after the pause
        }
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer?.disconnect();
  }

  async handle(message: { key?: string; value?: string }): Promise<void> {
    let event;
    try {
      event = parseUserEvent(message.value);
    } catch (error) {
      if (!(error instanceof InvalidUserEvent)) throw error;
      // Can never succeed: park it, with the original text, and move on.
      await this.kafka.send(USER_EVENTS_DLT, message.key ?? '', message.value ?? '', {
        'x-error': error.message,
        'x-source-topic': USER_EVENTS_TOPIC,
      });
      logger.error(JSON.stringify({ event: 'USER_EVENT_DEAD_LETTERED', reason: error.message }));
      return;
    }
    if (!event) return;
    const cancelled = await this.orders.cancelForSuspendedUser(event.userId);
    logger.log(JSON.stringify({ event: 'SUSPENDED_USER_ORDERS_CANCELLED', eventId: event.eventId, cancelled }));
  }
}
