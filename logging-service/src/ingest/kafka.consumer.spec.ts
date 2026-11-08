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
      consumer = () => ({
        connect: jest.fn(),
        subscribe: jest.fn(),
        run: jest.fn(),
        disconnect: jest.fn(),
      });
      admin = () => ({
        connect: jest.fn(),
        disconnect: jest.fn(),
        listTopics: jest.fn().mockResolvedValue([]),
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
