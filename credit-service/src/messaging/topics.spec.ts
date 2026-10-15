/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated unit tests for the retry-delay parser and topic names (spec §9.2).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { buildTopics, parseDelays } from './topics';

describe('parseDelays', () => {
  it('reads the default list', () => {
    expect(parseDelays('1s,5s,30s,2m,10m')).toEqual([1000, 5000, 30000, 120000, 600000]);
  });

  it('accepts milliseconds and spaces', () => {
    expect(parseDelays(' 300ms , 2s ')).toEqual([300, 2000]);
  });

  it('reads an empty string as no retries', () => {
    expect(parseDelays('')).toEqual([]);
  });

  it.each(['5', '0s', '-1s', '1h', '1.5s', '1s,,2s'])('rejects %p', (spec) => {
    expect(() => parseDelays(spec)).toThrow(/Invalid retry delay/);
  });
});

describe('buildTopics', () => {
  it('matches the names in infra/kafka/topics.txt and create-topics.sh', () => {
    expect(buildTopics([1000, 5000])).toEqual({
      userEvents: 'user.events',
      commands: 'credit.commands',
      retries: [
        { topic: 'credit.commands.retry.0', delayMs: 1000 },
        { topic: 'credit.commands.retry.1', delayMs: 5000 },
      ],
      commandsDeadLetter: 'credit.commands.dlt',
      userEventsDeadLetter: 'credit.user-events.dlt',
    });
  });

  it('prefixes every name, so tests never touch the real topics', () => {
    const t = buildTopics([1000], 'test-1.');
    expect([t.userEvents, t.commands, t.retries[0].topic, t.commandsDeadLetter, t.userEventsDeadLetter]).toEqual([
      'test-1.user.events',
      'test-1.credit.commands',
      'test-1.credit.commands.retry.0',
      'test-1.credit.commands.dlt',
      'test-1.credit.user-events.dlt',
    ]);
  });
});
