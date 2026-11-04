/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Generated the topic check tests (#152).
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Added the retry topic and NOTIFICATION_RETRY_DELAYS tests (#154).
 * Author review: pending — Jie Yang to record the review.
 */
import { buildTopics, findTopicMismatch, parseDelays } from './topics';

const all = [
  'order.events',
  'notification.order-events.retry.0',
  'notification.order-events.retry.1',
  'notification.order-events.dlt',
];

describe('topics', () => {
  it('names the source topic, one retry topic per delay, and Notification’s own dead-letter topic (rule 6)', () => {
    expect(buildTopics([1000, 5000])).toEqual({
      orderEvents: 'order.events',
      retries: [
        { topic: 'notification.order-events.retry.0', delayMs: 1000 },
        { topic: 'notification.order-events.retry.1', delayMs: 5000 },
      ],
      orderEventsDeadLetter: 'notification.order-events.dlt',
    });
  });

  it('passes when every topic exists, ignoring other services’ topics', () => {
    expect(findTopicMismatch(buildTopics([1000, 5000]), [...all, 'credit.commands', 'credit.commands.retry.0'])).toBeNull();
  });

  it('names a missing topic and where to add it', () => {
    expect(findTopicMismatch(buildTopics([1000, 5000]), ['order.events', 'notification.order-events.dlt'])).toMatch(
      /notification\.order-events\.retry\.0, notification\.order-events\.retry\.1.*infra\/kafka\/topics\.txt/,
    );
  });

  it('reports a retry topic that has no delay', () => {
    expect(findTopicMismatch(buildTopics([1000]), all)).toMatch(
      /notification\.order-events\.retry\.1 have no matching delay in NOTIFICATION_RETRY_DELAYS/,
    );
  });
});

describe('parseDelays', () => {
  it('reads ms, s and m', () => {
    expect(parseDelays('250ms, 1s,30s,2m')).toEqual([250, 1000, 30_000, 120_000]);
  });

  it('means no retries when empty', () => {
    expect(parseDelays(' ')).toEqual([]);
  });

  it.each(['0s', '1h', 'soon', '1.5s'])('refuses %s', (spec) => {
    expect(() => parseDelays(spec)).toThrow(/Invalid retry delay/);
  });
});
