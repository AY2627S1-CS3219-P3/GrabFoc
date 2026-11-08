/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Covers the publisher that hands this service's log lines to the Logging Service: the
 *        batch shape, the per-line key, and that a failed connection is retried on the next flush
 *        rather than cached (issue #52).
 * Author review: Cole Lin, read and approved.
 */

const sent: Array<Record<string, unknown>> = [];
const producer = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  send: jest.fn(async (payload: Record<string, unknown>) => {
    sent.push(payload);
  }),
};

jest.mock('@confluentinc/kafka-javascript', () => ({
  KafkaJS: {
    logLevel: { WARN: 1 },
    Kafka: class {
      producer = () => producer;
    },
  },
}));

import { KafkaLinePublisher } from './kafka.publisher';

beforeEach(() => {
  sent.length = 0;
  producer.send.mockClear();
  producer.connect.mockClear().mockResolvedValue(undefined);
  producer.disconnect.mockClear().mockResolvedValue(undefined);
});

function publisher(): KafkaLinePublisher {
  return new KafkaLinePublisher('logging.lines', ['kafka:9092']);
}

it('sends one batch to the topic, keeping each line as it was written', async () => {
  await publisher().publish([
    { key: 'r-1', value: '{"lineId":"a"}' },
    { key: 'r-1', value: '{"lineId":"b"}' },
  ]);
  expect(sent).toEqual([
    {
      topic: 'logging.lines',
      messages: [
        { key: 'r-1', value: '{"lineId":"a"}' },
        { key: 'r-1', value: '{"lineId":"b"}' },
      ],
    },
  ]);
});

it('keys by the requestId the shipper set, so one request stays in one partition', async () => {
  await publisher().publish([{ key: 'r-7', value: '{}' }]);
  const [{ messages }] = sent as Array<{ messages: Array<{ key: string | null }> }>;
  expect(messages[0].key).toBe('r-7');
});

it('sends a keyless line as a null key rather than the string "undefined"', async () => {
  // A startup or purge line has no request, so there is no sequence to preserve - but a key of
  // "undefined" would put every one of them in the same partition under a nonsense name.
  await publisher().publish([{ value: '{}' }]);
  const [{ messages }] = sent as Array<{ messages: Array<{ key: string | null }> }>;
  expect(messages[0].key).toBeNull();
});

it('connects once across flushes', async () => {
  const p = publisher();
  await p.publish([{ value: '{}' }]);
  await p.publish([{ value: '{}' }]);
  expect(producer.connect).toHaveBeenCalledTimes(1);
});

it('does not cache a failed connection, so the next flush tries again', async () => {
  producer.connect.mockRejectedValueOnce(new Error('broker is down'));
  const p = publisher();
  await expect(p.publish([{ value: '{}' }])).rejects.toThrow('broker is down');
  // The shipper catches this and counts it; what matters is that the next flush retries rather
  // than holding a rejected promise forever and never shipping again.
  await expect(p.publish([{ value: '{}' }])).resolves.toBeUndefined();
  expect(producer.connect).toHaveBeenCalledTimes(2);
});

it('is quiet on shutdown when it never connected', async () => {
  await publisher().stop();
  expect(producer.disconnect).not.toHaveBeenCalled();
});

it('swallows a failed disconnect, so shutdown is not what a log line breaks', async () => {
  producer.disconnect.mockRejectedValueOnce(new Error('already gone'));
  const p = publisher();
  await p.publish([{ value: '{}' }]);
  await expect(p.stop()).resolves.toBeUndefined();
});
