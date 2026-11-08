/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: This service's shipper instance and its shutdown, following
 *        supplier-service/src/common/log.ts (issue #52).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Review: defer to LogShipper.stop(), which exists for this and flushes twice; one
 *        flush left the last buffered lines to be discarded by the disconnect (issue #52).
 * Author review: Cole Lin, read and approved.
 */
import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { KafkaLinePublisher } from './kafka.publisher';
import { LogShipper } from './log-shipper';

// AI-generated (reviewed by Cole Lin).

/**
 * Read from the environment rather than from this service's validated config, deliberately.
 *
 * `log` below is a module-level singleton that the guard and the middleware import directly, so it
 * is built before Nest has an injector to ask - and a logging component must never be the reason a
 * service fails to start, which a config that throws on a missing variable would make it. Every
 * service's copy of this file reads the same two variables the same way, so they differ only in
 * the names.
 */
const brokers = (process.env.CREDIT_KAFKA_BROKERS || '')
  .split(',')
  .map((broker) => broker.trim())
  .filter(Boolean);

/**
 * The Kafka publisher, or undefined when no brokers are configured.
 *
 * Constructing it costs nothing and connects nothing: `KafkaLinePublisher` connects on its first
 * publish. With no brokers set - every test run, and any standalone run - nothing is built at all,
 * the shipper starts no flush timer, and lines go to stdout only.
 */
const publisher = brokers.length
  ? new KafkaLinePublisher(process.env.CREDIT_LOG_TOPIC || 'logging.lines', brokers)
  : undefined;

/**
 * This service's log lines, in the shape the Logging Service stores (issue #52). Lines always go to
 * stdout; with a publisher wired in they are also buffered and shipped to the topic its ingest
 * reads.
 */
export const log = new LogShipper({ service: 'credit', publisher });

/**
 * Stops the shipper and closes the producer on shutdown.
 *
 * Registered in `app.module.ts` so Nest's `enableShutdownHooks()` reaches it. Without this the last
 * flush interval's worth of lines is lost on every deploy - which are the lines about whatever was
 * happening as the container went down, the ones most worth having.
 */
@Injectable()
export class LogShipping implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    if (!publisher) return;
    try {
      // stop(), not flush(): it clears the interval and then flushes *twice*, because the first
      // flush only joins the publish already in flight and the second sends what was buffered
      // while that one ran. A single flush leaves those last lines in the buffer, and the
      // disconnect below then throws them away - which are the lines about whatever was
      // happening as the container went down. The shipper documents this; I had not read it.
      await log.stop();
    } catch (err) {
      // Never from here: flush() resolves even when a publish fails, and the lines are on stdout
      // regardless. Caught anyway so a shutdown cannot be the thing a log line breaks.
      new Logger('LogShipper').warn(`Final flush failed: ${err instanceof Error ? err.message : err}`);
    }
    await publisher.stop();
  }
}
