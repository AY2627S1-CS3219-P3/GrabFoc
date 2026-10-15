/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated helpers for the Kafka tests.
 * Author review: pending — Jian Bing to record what he checked.
 */
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { randomUUID } from 'crypto';
import { Topics } from '../messaging/topics';
import { setting } from './database';

/** The broker the Kafka tests use: CREDIT_TEST_KAFKA_BROKERS, else the Compose broker's host port. */
export function testKafkaBrokers(): string {
  return setting('CREDIT_TEST_KAFKA_BROKERS') || 'localhost:9094';
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

const allTopics = (t: Topics) => [
  t.userEvents,
  t.commands,
  ...t.retries.map((r) => r.topic),
  t.commandsDeadLetter,
  t.userEventsDeadLetter,
];

/**
 * Creates the test's own prefixed topics, standing in for kafka-init. One partition each, so
 * messages sent one after another are handled in that order. Returns a function deleting them.
 */
export async function createTestTopics(admin: KafkaJS.Admin, topics: Topics): Promise<() => Promise<void>> {
  const names = allTopics(topics);
  await admin.createTopics({ topics: names.map((topic) => ({ topic, numPartitions: 1 })) });
  return () => admin.deleteTopics({ topics: names });
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
