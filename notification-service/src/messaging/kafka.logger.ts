/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Copied from credit-service/src/messaging/kafka.logger.ts (#152), without Credit's filter
 *        for retry waits: Notification has no retry topics yet (#154).
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Added Credit's filter for retry waits, now that Notification has retry topics (#154).
 * Author review: pending — Jie Yang to record the review.
 */
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Logger } from '@nestjs/common';

/**
 * The message of the error Notification throws to make the library re-read a retry message later.
 * The library logs every thrown error, so without this filter a normal retry wait looks like a failure.
 */
export const NOT_DUE_YET = 'Retry message not due yet';

/** A logger for the Kafka client that writes through Nest's logger (context "Kafka"). */
export function kafkaLogger(target = new Logger('Kafka')): KafkaJS.Logger {
  let level = KafkaJS.logLevel.WARN;
  const withName = (message: string, extra?: object) => {
    const name = (extra as { name?: unknown } | undefined)?.name;
    return typeof name === 'string' ? `${message} (${name})` : message;
  };
  const logger: KafkaJS.Logger = {
    error: (message, extra) => {
      if (level < KafkaJS.logLevel.ERROR || message.includes(NOT_DUE_YET)) return;
      target.error(withName(message, extra));
    },
    warn: (message, extra) => {
      if (level >= KafkaJS.logLevel.WARN) target.warn(withName(message, extra));
    },
    info: (message, extra) => {
      if (level >= KafkaJS.logLevel.INFO) target.log(withName(message, extra));
    },
    debug: (message, extra) => {
      if (level >= KafkaJS.logLevel.DEBUG) target.debug(withName(message, extra));
    },
    namespace: () => logger,
    setLogLevel: (next) => {
      level = next;
    },
  };
  return logger;
}
