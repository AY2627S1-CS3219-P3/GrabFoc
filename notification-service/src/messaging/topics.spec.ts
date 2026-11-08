/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Generated the topic check tests (#152).
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Added the retry topic and NOTIFICATION_RETRY_DELAYS tests (#154).
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Topics grouped into streams, with the user.events stream (#183).
 * Author review: pending — Jie Yang to record the review.
 */
import { allTopics, buildTopics, findTopicMismatch, parseDelays, streamOf } from './topics';

const topics = buildTopics([1000, 5000]);
const all = allTopics(topics);

describe('topics', () => {
  it('names each source topic, one retry topic per delay, and Notification’s own dead-letter topic (rule 6)', () => {
    expect(topics).toEqual({
      orders: {
        source: 'order.events',
        retries: [
          { topic: 'notification.order-events.retry.0', delayMs: 1000 },
          { topic: 'notification.order-events.retry.1', delayMs: 5000 },
        ],
        deadLetter: 'notification.order-events.dlt',
      },
      users: {
        source: 'user.events',
        retries: [
          { topic: 'notification.user-events.retry.0', delayMs: 1000 },
          { topic: 'notification.user-events.retry.1', delayMs: 5000 },
        ],
        deadLetter: 'notification.user-events.dlt',
      },
    });
  });

  it('finds the stream of a source or retry topic, and none for a dead-letter or other topic', () => {
    expect(streamOf('user.events', topics)).toBe(topics.users);
    expect(streamOf('notification.order-events.retry.1', topics)).toBe(topics.orders);
    expect(streamOf('notification.order-events.dlt', topics)).toBeUndefined();
    expect(streamOf('credit.commands', topics)).toBeUndefined();
  });

  it('passes when every topic exists, ignoring other services’ topics', () => {
    expect(findTopicMismatch(topics, [...all, 'credit.commands', 'credit.commands.retry.0'])).toBeNull();
  });

  it('names a missing topic and where to add it', () => {
    expect(findTopicMismatch(topics, all.filter((t) => !t.startsWith('notification.user-events')))).toMatch(
      /notification\.user-events\.retry\.0, notification\.user-events\.retry\.1, notification\.user-events\.dlt.*infra\/kafka\/topics\.txt/,
    );
  });

  it('reports a retry topic that has no delay, in either stream', () => {
    expect(findTopicMismatch(buildTopics([1000]), all)).toMatch(
      /notification\.order-events\.retry\.1, notification\.user-events\.retry\.1 have no matching delay/,
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
