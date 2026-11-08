/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Covers the three things that had moved under the 2026-10-21 draft of kafka.consumer.ts:
 *        the inbound headers reaching the seam, the dead letter carrying the redacted body rather
 *        than the bytes that arrived, and the request id being copied onto it. Each case fails
 *        against that draft (issue #52). Six of the nine do; the other three pass either way and
 *        are marked as controls below rather than counted as proof.
 * Author review: Cole Lin, read and approved.
 */

// Hoisted by jest above the imports, so the class under test builds its client from this.
const sent: Array<Record<string, unknown>> = [];
let consumerRuns = 0;
let existingTopics: string[] = [];
let failAt: 'connect' | 'subscribe' | undefined;
let failConsumerDisconnect = false;
const consumers: Array<{ disconnect: jest.Mock }> = [];
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
      consumer = () => {
        const made = {
          connect: jest.fn(async () => {
            if (failAt === 'connect') throw new Error('connect failed');
          }),
          subscribe: jest.fn(async () => {
            if (failAt === 'subscribe') throw new Error('subscribe failed');
          }),
          run: jest.fn(async () => {
            consumerRuns += 1;
          }),
          disconnect: jest.fn(async () => {
            if (failConsumerDisconnect) throw new Error('disconnect failed');
          }),
        };
        consumers.push(made);
        return made;
      };
      admin = () => ({
        connect: jest.fn(),
        disconnect: jest.fn(),
        // Empty by default, which is what the missing-topic case needs; a test that wants start()
        // to get past it pushes the names in.
        listTopics: jest.fn(async () => existingTopics),
      });
    },
  },
}));

import { config } from '../config';
import { InboundMessage } from './consumer';
import { KafkaIngest, toInbound } from './kafka.consumer';

type Message = Parameters<typeof toInbound>[2];

/** Only the fields `toInbound` reads; the real type carries a dozen more. */
function message(fields: Partial<Record<'value' | 'offset' | 'headers', unknown>>): Message {
  return fields as unknown as Message;
}

beforeEach(() => {
  sent.length = 0;
  consumerRuns = 0;
  existingTopics = [];
  failAt = undefined;
  failConsumerDisconnect = false;
  consumers.length = 0;
  producer.send.mockClear();
  producer.connect.mockClear();
});

describe('a consumed message reaching the seam', () => {
  it('carries its headers, which the dead-letter path reads the request id from', () => {
    const inbound = toInbound(
      'logging.lines',
      2,
      message({ value: Buffer.from('{}'), offset: '41', headers: { 'x-request-id': 'r-1' } }),
    );
    expect(inbound.headers).toEqual({ 'x-request-id': 'r-1' });
    expect(inbound).toMatchObject({ topic: 'logging.lines', partition: 2, offset: '41', value: '{}' });
  });

  it('keeps the last value of a repeated header, as the comment claims', () => {
    const inbound = toInbound(
      'logging.lines',
      0,
      message({ value: Buffer.from('{}'), headers: { 'x-request-id': ['first', 'last'] } }),
    );
    expect(inbound.headers).toEqual({ 'x-request-id': 'last' });
  });

  it('is an empty object, not undefined, when the message had no headers', () => {
    expect(toInbound('logging.lines', 0, message({ value: Buffer.from('{}') })).headers).toEqual({});
  });

  // A control: the draft did this too.
  it('reads a value-less message as an empty string rather than throwing', () => {
    expect(toInbound('logging.lines', 0, message({ value: null })).value).toBe('');
  });
});

describe('starting up', () => {
  const topic = config.kafkaTopic;
  const dlt = config.kafkaDeadLetterTopic;
  afterEach(() => {
    (config as { kafkaTopic: string }).kafkaTopic = topic;
    (config as { kafkaDeadLetterTopic: string }).kafkaDeadLetterTopic = dlt;
  });

  it('refuses a dead-letter topic equal to the source topic', async () => {
    (config as { kafkaDeadLetterTopic: string }).kafkaDeadLetterTopic = config.kafkaTopic;
    // Otherwise the first refused line is parked back onto the topic it came from, rejected again
    // because a dead-letter body is not a valid log line, and republished without end.
    await expect(new KafkaIngest().start(async () => undefined)).rejects.toThrow(
      /both "logging\.lines"/,
    );
  });
});

describe('shutting down', () => {
  it('disconnects once even when both destroy hooks call it at the same time', async () => {
    const ingest = new KafkaIngest();
    await ingest.send(
      { value: '{}', topic: 'logging.lines', offset: '1', headers: {} },
      'reason',
      '{}',
    );
    producer.disconnect.mockClear();
    // Nest runs provider destroy hooks concurrently with Promise.all, and two of them call this.
    await Promise.all([ingest.stop(), ingest.stop()]);
    expect(producer.disconnect).toHaveBeenCalledTimes(1);
  });
});

describe('a start that races shutdown', () => {
  it('leaves no consumer running when stop lands while start is still working', async () => {
    existingTopics = [config.kafkaTopic, config.kafkaDeadLetterTopic];
    const ingest = new KafkaIngest();
    const starting = ingest.start(async () => undefined);
    // SIGTERM in the gap: ensureTopics() connects an admin client, then the consumer connects and
    // subscribes, and a stop completing in any of those gaps used to leave start() free to build
    // a consumer that nothing could ever disconnect.
    await ingest.stop();
    await starting;
    // Nothing was handed a live consumer, so a further stop has nothing to disconnect.
    producer.disconnect.mockClear();
    await ingest.stop();
    expect(consumerRuns).toBe(0);
  });

  it('still coalesces two concurrent stops into one teardown', async () => {
    const ingest = new KafkaIngest();
    await ingest.send(
      { value: '{}', topic: 'logging.lines', offset: '1', headers: {} },
      'reason',
      '{}',
    );
    producer.disconnect.mockClear();
    await Promise.all([ingest.stop(), ingest.stop()]);
    expect(producer.disconnect).toHaveBeenCalledTimes(1);
  });
});

describe('a startup that fails partway', () => {
  beforeEach(() => {
    existingTopics = [config.kafkaTopic, config.kafkaDeadLetterTopic];
  });

  it.each(['connect', 'subscribe'] as const)(
    'disconnects the client it built when %s rejects, so a retry does not stack another',
    async (where) => {
      failAt = where;
      const ingest = new KafkaIngest();
      await expect(ingest.start(async () => undefined)).rejects.toThrow(`${where} failed`);
      // One client built, and it was disconnected: the caller retries by building another, so a
      // transient failure would otherwise leave a connected member of the group behind each time.
      expect(consumers).toHaveLength(1);
      expect(consumers[0].disconnect).toHaveBeenCalledTimes(1);
    },
  );

  it('leaves nothing for a later stop to find after a failed subscribe', async () => {
    failAt = 'subscribe';
    const ingest = new KafkaIngest();
    await expect(ingest.start(async () => undefined)).rejects.toThrow();
    consumers[0].disconnect.mockClear();
    await ingest.stop();
    expect(consumers[0].disconnect).not.toHaveBeenCalled();
  });
});

describe('shutting down when a client will not disconnect', () => {
  it('still disconnects the producer when the consumer rejects', async () => {
    existingTopics = [config.kafkaTopic, config.kafkaDeadLetterTopic];
    const ingest = new KafkaIngest();
    await ingest.start(async () => undefined);
    await ingest.send({ value: '{}', topic: 'logging.lines', offset: '1', headers: {} }, 'r', '{}');
    producer.disconnect.mockClear();
    failConsumerDisconnect = true;
    // The failure is still reported - a teardown that could not finish is worth knowing - but it
    // must not mean the dead-letter producer stays connected with its resources held.
    await expect(ingest.stop()).rejects.toThrow('disconnect failed');
    expect(producer.disconnect).toHaveBeenCalledTimes(1);
  });
});

describe('parking a line this service will not store', () => {
  const inbound: InboundMessage = {
    value: '{"this":"is what arrived, unredacted"}',
    topic: 'logging.lines',
    partition: 3,
    offset: '77',
    headers: { 'x-request-id': 'r-9' },
  };

  it('publishes the redacted body, never the bytes that arrived', async () => {
    await new KafkaIngest().send(inbound, 'line refused by the store', '{"this":"is the redacted copy"}');
    const [{ messages }] = sent as Array<{ messages: Array<{ value: string | null }> }>;
    expect(messages[0].value).toBe('{"this":"is the redacted copy"}');
    // The whole point of the seam taking a body: a rejected line has not been through redaction,
    // so parking what arrived would copy it into the one topic a human goes looking in.
    expect(messages[0].value).not.toContain('unredacted');
  });

  it('copies the request id across, so the dead letter ties back to its request', async () => {
    await new KafkaIngest().send(inbound, 'line refused by the store', '{}');
    const [{ messages }] = sent as Array<{ messages: Array<{ headers: Record<string, string> }> }>;
    expect(messages[0].headers['x-request-id']).toBe('r-9');
  });

  // A control, not a proof: the draft never copied the id at all, so this passed there too. It is
  // here for the *absent rather than empty* distinction, which is easy to break later.
  it('leaves the request id off entirely when the inbound message had none', async () => {
    await new KafkaIngest().send({ ...inbound, headers: {} }, 'unparseable', null);
    const [{ messages }] = sent as Array<{ messages: Array<{ headers: Record<string, string> }> }>;
    // Absent, not empty: an empty header reads as "there was no request", a different claim from
    // "the id is unknown".
    expect('x-request-id' in messages[0].headers).toBe(false);
  });

  it('parks a value-less message when the bytes could not be parsed, keeping the source position', async () => {
    await new KafkaIngest().send(inbound, 'not JSON', null);
    const [{ topic, messages }] = sent as Array<{
      topic: string;
      messages: Array<{ key: string | null; value: string | null; headers: Record<string, string> }>;
    }>;
    expect(topic).toBe(config.kafkaDeadLetterTopic);
    expect(messages[0].value).toBeNull();
    // With no body to show, the headers are the only way back to the original, which Kafka still
    // has in the source topic.
    expect(messages[0].headers).toMatchObject({
      'x-error': 'not JSON',
      'x-source-topic': 'logging.lines',
      'x-source-partition': '3',
      'x-source-offset': '77',
    });
    expect(messages[0].key).toBe('77');
  });

  // Also a control: the draft connected once as well.
  it('connects once across several dead letters', async () => {
    const ingest = new KafkaIngest();
    await ingest.send(inbound, 'first', '{}');
    await ingest.send(inbound, 'second', '{}');
    expect(producer.connect).toHaveBeenCalledTimes(1);
    expect(producer.send).toHaveBeenCalledTimes(2);
  });
});
