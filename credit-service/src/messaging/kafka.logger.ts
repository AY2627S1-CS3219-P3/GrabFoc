/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Generated the Kafka client's logger: library logs go through Nest's logger, and the
 *        library's error for a retry message that isn't due yet is dropped.
 * Author review: pending — Jian Bing to record what he checked.
 */
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Logger } from '@nestjs/common';

/**
 * The message of the error Credit throws to make the library re-read a retry message later. The
 * library logs every thrown error, so without this filter a normal retry wait looks like a failure.
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
