/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Copied the Kafka test helpers from credit-service/src/test/kafka.ts (#152).
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: createTestTopics waits until the broker lists the new topics (fixes a flaky setup).
 * Author review: pending — Jie Yang to record the review.
 */
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { randomUUID } from 'crypto';
import { allTopics, Topics } from '../messaging/topics';
import { setting } from './database';

/** The broker the Kafka tests use: NOTIFICATION_TEST_KAFKA_BROKERS, else the Compose broker's host port. */
export function testKafkaBrokers(): string {
  return setting('NOTIFICATION_TEST_KAFKA_BROKERS') || '127.0.0.1:9094';
}

/** Polls `check` every 100 ms until it returns something truthy, or fails after `timeoutMs`. */
export async function waitFor<T>(check: () => Promise<T | null | undefined | false>, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await check();
    if (result) return result;
    if (Date.now() > deadline) throw new Error(`Timed out after ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * Creates the test's own prefixed topics, standing in for kafka-init. One partition each, so
 * messages sent one after another are handled in that order. Returns a function deleting them.
 */
export async function createTestTopics(admin: KafkaJS.Admin, topics: Topics): Promise<() => Promise<void>> {
  const names = allTopics(topics);
  try {
    // The client's 5 s default is too short while the broker is still deleting a previous run's topics.
    await admin.createTopics({ timeout: 30_000, topics: names.map((topic) => ({ topic, numPartitions: 1 })) });
  } catch (err) {
    // The client's aggregate error hides the per-topic reasons; show them.
    const reasons = ((err as { errors?: { message?: string }[] }).errors ?? []).map((e) => e.message);
    throw new Error(`Couldn't create the test topics: ${(err as Error).message}: ${reasons.join('; ')}`);
  }
  // createTopics can return before the broker's metadata lists every new topic; the runner's startup
  // check would then report one as missing.
  await waitFor(async () => {
    const listed = new Set(await admin.listTopics());
    return names.every((name) => listed.has(name));
  }, 30_000);
  return () => admin.deleteTopics({ topics: names, timeout: 30_000 });
}

/** Reads every message on `topic` into the returned array, from the start, until `stop()`. */
export async function collect(
  kafka: KafkaJS.Kafka,
  topic: string,
): Promise<{ messages: KafkaJS.KafkaMessage[]; stop: () => Promise<void> }> {
  const messages: KafkaJS.KafkaMessage[] = [];
  const consumer = kafka.consumer({ kafkaJS: { groupId: `collect-${randomUUID()}`, fromBeginning: true } });
  await consumer.connect();
  await consumer.subscribe({ topics: [topic] });
  await consumer.run({
    eachMessage: async ({ message }) => {
      messages.push(message);
    },
  });
  return { messages, stop: () => consumer.disconnect() };
}
