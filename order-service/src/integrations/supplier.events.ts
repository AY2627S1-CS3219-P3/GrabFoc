/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
 * Scope: Generated the supplier.events consumer (issue #121): SupplierDeactivated cancels the
 *        location's unfinished orders; unreadable events go to order.supplier-events.dlt. Modelled
 *        on the user.events consumer.
 * Author review: Reviewed by Zi Yi, 2026-10-30.
 */
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { z } from 'zod';
import { appConfig } from '../config';
import { OrdersService } from '../orders/orders.service';
import { KafkaProducer } from './kafka.producer';

/** The Supplier Service owns this topic and the event shape (supplier-service/AGENTS.md). */
export const SUPPLIER_EVENTS_TOPIC = 'supplier.events';
/** Order's own dead-letter topic for it (root AGENTS.md §3 Messaging, rule 6). */
export const SUPPLIER_EVENTS_DLT = 'order.supplier-events.dlt';
// Its own group, so a rebalance of one topic's consumer never stalls the other's.
const GROUP_ID = 'order-service.supplier-events';
const RETRY_PAUSE_MS = 5000;

// Not strict: the owner may add fields, and Order reads only these.
const supplierDeactivatedSchema = z.object({
  eventType: z.literal('SupplierDeactivated'),
  eventId: z.string().uuid(),
  occurredAt: z.string().datetime({ offset: true }),
  data: z.object({ locationId: z.number().int().positive() }),
});

export class InvalidSupplierEvent extends Error {}

export interface Deactivation {
  eventId: string;
  locationId: number;
  occurredAt: Date;
}

/** The deactivated location; null for event types Order doesn't handle. */
export function parseSupplierEvent(value: string | undefined): Deactivation | null {
  let json: unknown;
  try {
    json = JSON.parse(value ?? '');
  } catch {
    throw new InvalidSupplierEvent('The message is not JSON.');
  }
  if (typeof json !== 'object' || json === null || typeof (json as { eventType?: unknown }).eventType !== 'string') {
    throw new InvalidSupplierEvent('The message has no eventType.');
  }
  if ((json as { eventType: string }).eventType !== 'SupplierDeactivated') return null;
  const result = supplierDeactivatedSchema.safeParse(json);
  if (!result.success) throw new InvalidSupplierEvent('Invalid SupplierDeactivated event.');
  const { eventId, occurredAt, data } = result.data;
  return { eventId, locationId: data.locationId, occurredAt: new Date(occurredAt) };
}

const logger = new Logger('Order');

/**
 * Consumes supplier.events, like UserEvents: main.ts calls start(); tests call handle() directly.
 * An offset is stored only after handle() returns (rule 2); any other failure pauses the partition
 * and retries the same event, so a deactivation is never skipped.
 */
@Injectable()
export class SupplierEvents implements OnModuleDestroy {
  private consumer?: KafkaJS.Consumer;

  constructor(
    private readonly orders: OrdersService,
    private readonly kafka: KafkaProducer,
  ) {}

  async start(): Promise<void> {
    const kafka = new KafkaJS.Kafka({
      kafkaJS: { clientId: 'order-service', brokers: appConfig().kafkaBrokers, logLevel: KafkaJS.logLevel.WARN },
    });
    // fromBeginning: no deactivation sent before Order first ran is missed. A replay is harmless:
    // only orders created before the event are cancelled.
    this.consumer = kafka.consumer({ kafkaJS: { groupId: GROUP_ID, fromBeginning: true } });
    await this.consumer.connect();
    await this.consumer.subscribe({ topics: [SUPPLIER_EVENTS_TOPIC] });
    await this.consumer.run({
      eachMessage: async ({ message, pause }) => {
        try {
          await this.handle({ key: message.key?.toString(), value: message.value?.toString() });
        } catch (error) {
          logger.warn(JSON.stringify({ event: 'SUPPLIER_EVENT_FAILED', error: String(error) }));
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
      event = parseSupplierEvent(message.value);
    } catch (error) {
      if (!(error instanceof InvalidSupplierEvent)) throw error;
      // Can never succeed: park it, with the original text, and move on.
      await this.kafka.send(SUPPLIER_EVENTS_DLT, message.key ?? '', message.value ?? '', {
        'x-error': error.message,
        'x-source-topic': SUPPLIER_EVENTS_TOPIC,
      });
      logger.error(JSON.stringify({ event: 'SUPPLIER_EVENT_DEAD_LETTERED', reason: error.message }));
      return;
    }
    if (!event) return;
    const cancelled = await this.orders.cancelForDeactivatedLocation(event.locationId, event.occurredAt);
    logger.log(
      JSON.stringify({ event: 'DEACTIVATED_LOCATION_ORDERS_CANCELLED', eventId: event.eventId, locationId: event.locationId, cancelled }),
    );
  }
}
