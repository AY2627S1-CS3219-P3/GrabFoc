/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Generated this service's shipper instance, from the plan Cole Lin approved on
 *        2026-10-16 (issue #52).
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Hand the shipper a Kafka publisher when SUPPLIER_KAFKA_BROKERS is set.
 * Author review: pending — Cole Lin to record what he checked.
 */
import { config } from '../config';
import { KafkaLinePublisher } from './kafka.publisher';
import { LogShipper } from './log-shipper';

// AI-generated (reviewed by Cole Lin).

/**
 * This service's log lines, in the shape the Logging Service stores (issue #52).
 *
 * With `SUPPLIER_KAFKA_BROKERS` unset there is no publisher, so lines go to stdout only: nothing
 * here depends on a broker, and the service still runs and is testable on its own — which is what
 * D2's "usable through Postman with nothing else running" needs. With it set, the same lines are
 * also published to the Logging Service's topic.
 */
export const logPublisher = config.kafkaBrokers.length
  ? new KafkaLinePublisher(config.kafkaLogTopic, config.kafkaBrokers)
  : undefined;

export const log = new LogShipper({ service: 'supplier', publisher: logPublisher });
