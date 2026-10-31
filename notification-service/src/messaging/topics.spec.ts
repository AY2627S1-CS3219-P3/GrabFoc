/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Generated the topic check tests (#152).
 * Author review: pending — Jie Yang to record the review.
 */
import { buildTopics, findTopicMismatch } from './topics';

describe('topics', () => {
  it('names the source topic and Notification’s own dead-letter topic (rule 6)', () => {
    expect(buildTopics()).toEqual({
      orderEvents: 'order.events',
      orderEventsDeadLetter: 'notification.order-events.dlt',
    });
  });

  it('passes when every topic exists, ignoring other services’ topics', () => {
    expect(findTopicMismatch(buildTopics(), ['order.events', 'notification.order-events.dlt', 'credit.commands'])).toBeNull();
  });

  it('names the missing topic and where to add it', () => {
    expect(findTopicMismatch(buildTopics(), ['order.events'])).toMatch(
      /notification\.order-events\.dlt.*infra\/kafka\/topics\.txt/,
    );
  });
});
