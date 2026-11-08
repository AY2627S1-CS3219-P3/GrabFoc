/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Generated this service's shipper instance, from the plan Cole Lin approved on
 *        2026-10-16 (issue #52).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Hand the shipper a Kafka publisher when brokers are configured, so lines reach the
 *        Logging Service's store and not only this container's stdout. The shared broker (#75)
 *        this was waiting for is merged (issue #52).
 * Author review: Cole Lin, read and approved.
 */
import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { config } from '../config';
import { KafkaLinePublisher } from './kafka.publisher';
import { LogShipper } from './log-shipper';

// AI-generated (reviewed by Cole Lin).

/**
 * The Kafka publisher, or undefined when no brokers are configured.
 *
 * Built here rather than injected, because `log` below is a module-level singleton that the auth
 * guard and the request middleware import directly - they run outside Nest's lifecycle, so there
 * is no injector to ask. The shipper takes its publisher at construction and never afterwards,
 * which is deliberate: there is no window in which a line is emitted against a half-wired shipper.
 *
 * Constructing it costs nothing and connects nothing: `KafkaLinePublisher` connects on its first
 * publish. With no brokers set - every test run, and any standalone run - nothing is built at all,
 * the shipper starts no flush timer, and lines go to stdout exactly as before.
 */
const publisher = config.kafkaBrokers.length
  ? new KafkaLinePublisher(config.logTopic, config.kafkaBrokers)
  : undefined;

/**
 * This service's log lines, in the shape the Logging Service stores (issue #52). Lines always go
 * to stdout; with a publisher wired in they are also buffered and shipped to `config.logTopic`,
 * where the Logging Service's ingest reads them.
 */
export const log = new LogShipper({ service: 'supplier', publisher });

/**
 * Flushes what is buffered and closes the producer on shutdown.
 *
 * Registered in `app.module.ts` so Nest's `enableShutdownHooks()` reaches it. Without this the
 * last flush interval's worth of lines is lost on every deploy - which are the lines about
 * whatever was happening as the container went down, the ones most worth having.
 */
@Injectable()
export class LogShipping implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    if (!publisher) return;
    try {
      await log.flush();
    } catch (err) {
      // Never from here: flush() resolves even when a publish fails, and the lines are on stdout
      // regardless. Caught anyway so a shutdown cannot be the thing a log line breaks.
      new Logger('LogShipper').warn(`Final flush failed: ${err instanceof Error ? err.message : err}`);
    }
    await publisher.stop();
  }
}
