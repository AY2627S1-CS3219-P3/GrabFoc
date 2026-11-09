/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-09
 * Scope: This service's test setup pins NOTIFICATION_KAFKA_BROKERS to an unreachable address on
 *        purpose, to prove the service does not depend on Kafka. The log shipper read that
 *        variable and built a producer against it, which kept retrying in the background: every
 *        test passed and the runner then failed the job on open handles. This is the case that
 *        must not come back (issue #52).
 * Author review: Cole Lin, read and approved.
 */

const kafkaConstructed = jest.fn();

jest.mock('@confluentinc/kafka-javascript', () => ({
  KafkaJS: {
    logLevel: { WARN: 1 },
    Kafka: class {
      constructor(...args: unknown[]) {
        kafkaConstructed(...args);
      }
      producer = () => ({
        connect: jest.fn(),
        disconnect: jest.fn(),
        send: jest.fn(),
      });
    },
  },
}));

// AI-generated (reviewed by Cole Lin).

describe('the log shipper under a test runner', () => {
  it('builds no Kafka client, even with brokers configured', async () => {
    // What this suite's own setup does, and the condition that broke the job.
    expect(process.env.NOTIFICATION_KAFKA_BROKERS).toBeTruthy();
    expect(process.env.NODE_ENV).toBe('test');

    await import('./log');

    // No client, so nothing to retry in the background and nothing holding the process open.
    expect(kafkaConstructed).not.toHaveBeenCalled();
  });

  it('still writes lines to stdout, which is what a test would want to see', async () => {
    const { log } = await import('./log');
    const written = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      log.emit({ level: 'info', event: 'probe' });
      expect(written).toHaveBeenCalledTimes(1);
      const line = JSON.parse(written.mock.calls[0][0] as string);
      expect(line).toMatchObject({ service: 'notification', event: 'probe', level: 'info' });
    } finally {
      written.mockRestore();
    }
  });
});
