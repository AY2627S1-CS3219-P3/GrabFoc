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
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Review: read the repo-root .env here, because this module is imported before the
 *        service config or Nest has loaded it (issue #52).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-09
 * Scope: Build no publisher under a test runner: a suite that pins the broker variable to an
 *        unreachable address left a client retrying in the background and the runner failed
 *        the job on open handles, with every test passing (issue #52).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-09
 * Scope: Review: detect `node --test` as well, which leaves NODE_ENV unset - so the Order
 *        Service was still building a producer in its tests (issue #52).
 * Author review: Cole Lin, read and approved.
 */
import * as path from 'path';
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
// Loaded here because this file is imported before anything else has read it: a service whose
// config calls loadEnvFile does so when *its* module runs, and user-service's ConfigModule reads
// the file during bootstrap - both after this line. Without it, a local run with the settings only
// in the repo-root .env saw no brokers, built no publisher, and shipped every line to stdout while
// looking entirely healthy. loadEnvFile does not overwrite a variable that is already set, so in
// Compose the container's own environment still wins (review).
try {
  process.loadEnvFile(path.resolve(__dirname, '../../../.env'));
} catch {
  // No .env, which is every containerised run and most test runs.
}

const brokers = (process.env.ORDER_KAFKA_BROKERS || '')
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
/**
 * Whether a test runner is running this. Three signals rather than one, because the repository
 * uses three runners and only some of them say so: Jest and vitest set `NODE_ENV=test`, while
 * `node --test` - which the Order Service uses - leaves it unset and sets `NODE_TEST_CONTEXT`
 * instead. Checking only `NODE_ENV` left Order building a real producer from the repository-root
 * `.env` that this module loads a few lines above (review).
 */
const underTest =
  process.env.NODE_ENV === 'test' ||
  Boolean(process.env.NODE_TEST_CONTEXT) ||
  Boolean(process.env.JEST_WORKER_ID) ||
  Boolean(process.env.VITEST);

// Never under a test runner, whatever the broker variable says. A suite that pins it to an
// unreachable address - which one of these services does deliberately, to prove it does not depend
// on Kafka - would otherwise have this build a client that keeps retrying in the background: the
// tests pass, the process never exits cleanly, and the runner fails the job on open handles. No
// test wants lines shipped anywhere, and a log shipper must never be the reason a suite hangs.
const shipping = brokers.length > 0 && !underTest;
const publisher = shipping
  ? new KafkaLinePublisher(process.env.ORDER_LOG_TOPIC || 'logging.lines', brokers)
  : undefined;

/**
 * This service's log lines, in the shape the Logging Service stores (issue #52). Lines always go to
 * stdout; with a publisher wired in they are also buffered and shipped to the topic its ingest
 * reads.
 */
export const log = new LogShipper({ service: 'order', publisher });

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
