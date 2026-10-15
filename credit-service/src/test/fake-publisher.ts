/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated an in-memory Publisher for tests that don't need Kafka.
 * Author review: pending — Jian Bing to record what he checked.
 */
import { OutboundMessage, Publisher } from '../messaging/messages';

export class FakePublisher implements Publisher {
  sent: OutboundMessage[] = [];
  /** Makes the next send fail, as if Kafka were down. */
  failNext = false;

  async send(message: OutboundMessage): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('Kafka is unavailable');
    }
    this.sent.push(message);
  }
}
