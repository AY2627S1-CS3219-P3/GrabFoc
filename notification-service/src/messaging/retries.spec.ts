/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Generated the retry routing tests (#154).
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Tests take a stream; added the user.events stream case (#183).
 * Author review: pending — Jie Yang to record the review.
 */
// AI-generated (pending review)
import { HEADER, InboundMessage } from './messages';
import { nextHop, waitBeforeProcessing } from './retries';
import { buildTopics } from './topics';

const stream = buildTopics([1000, 5000]).orders;
const ORDER = 'aaaaaaaa-0000-4000-8000-000000000001';
const value = Buffer.from(JSON.stringify({ eventId: 'bbbbbbbb-0000-4000-8000-000000000002', data: { orderId: ORDER } }));
const NOW = 1_000_000;

function message(topic: string, headers: Record<string, string> = {}): InboundMessage {
  return { topic, partition: 2, offset: '41', key: ORDER, value, headers };
}

describe('waitBeforeProcessing', () => {
  it('waits until a retry message is due', () => {
    const due = message(stream.retries[1].topic, { [HEADER.dueAt]: String(NOW + 3000) });
    expect(waitBeforeProcessing(due, stream, NOW)).toBe(3000);
  });

  it('handles it at once when it is already due', () => {
    expect(waitBeforeProcessing(message(stream.retries[0].topic, { [HEADER.dueAt]: String(NOW - 1) }), stream, NOW)).toBe(0);
  });

  it('never waits longer than the topic’s own delay', () => {
    const inflated = message(stream.retries[0].topic, { [HEADER.dueAt]: String(NOW + 3_600_000) });
    expect(waitBeforeProcessing(inflated, stream, NOW)).toBe(1000);
  });

  it('ignores a due header on order.events', () => {
    expect(waitBeforeProcessing(message('order.events', { [HEADER.dueAt]: String(NOW + 3000) }), stream, NOW)).toBe(0);
  });
});

describe('nextHop', () => {
  it('sends a first failure to the first retry topic, keyed by order id, keeping the original bytes', () => {
    const next = nextHop(message('order.events'), stream, ['ESOCKET'], NOW);
    expect(next.topic).toBe(stream.retries[0].topic);
    expect(next.key).toBe(ORDER);
    expect(next.value).toBe(value);
    expect(next.headers).toMatchObject({
      [HEADER.attempt]: '1',
      [HEADER.dueAt]: String(NOW + 1000),
      [HEADER.errorCode]: 'ESOCKET',
      [HEADER.sourceTopic]: 'order.events',
      [HEADER.sourcePartition]: '2',
      [HEADER.sourceOffset]: '41',
    });
  });

  it('moves a retry on to the next topic and keeps where the event first came from', () => {
    const retry = message(stream.retries[0].topic, {
      [HEADER.attempt]: '1',
      [HEADER.sourcePartition]: '0',
      [HEADER.sourceOffset]: '7',
    });
    const next = nextHop(retry, stream, ['USER_UNAVAILABLE'], NOW);
    expect(next.topic).toBe(stream.retries[1].topic);
    expect(next.headers).toMatchObject({ [HEADER.attempt]: '2', [HEADER.sourcePartition]: '0', [HEADER.sourceOffset]: '7' });
  });

  it('dead-letters the event once the retries are used up', () => {
    const last = message(stream.retries[1].topic, { [HEADER.attempt]: '2' });
    const next = nextHop(last, stream, ['ESOCKET', 'SMTP_421'], NOW);
    expect(next.topic).toBe(stream.deadLetter);
    expect(next.headers[HEADER.attempt]).toBe('3');
    expect(next.headers[HEADER.error]).toBe('Emails not sent: ESOCKET, SMTP_421');
    expect(next.headers[HEADER.deadLetteredAt]).toBe(new Date(NOW).toISOString());
    expect(next.headers[HEADER.dueAt]).toBeUndefined();
  });

  it('ignores an attempt header on order.events, so a publisher can’t skip the retries', () => {
    const forged = message('order.events', { [HEADER.attempt]: '99' });
    expect(nextHop(forged, stream, ['ESOCKET'], NOW).topic).toBe(stream.retries[0].topic);
  });

  it('routes a user.events failure through Notification’s user-events topics, keyed by the user', () => {
    const users = buildTopics([1000, 5000]).users;
    const next = nextHop({ ...message('user.events'), key: 'user-1' }, users, ['ESOCKET'], NOW);
    expect(next.topic).toBe('notification.user-events.retry.0');
    expect(next.key).toBe('user-1');
    expect(next.headers[HEADER.sourceTopic]).toBe('user.events');
  });
});
