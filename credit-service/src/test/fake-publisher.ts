/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated an in-memory Publisher for tests that don't need Kafka.
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Added the `during` hook (PR #85 review).
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
 */
import { OutboundMessage, Publisher } from '../messaging/messages';

export class FakePublisher implements Publisher {
  sent: OutboundMessage[] = [];
  /** Makes the next send fail, as if Kafka were down. */
  failNext = false;
  /** Runs while a send is in progress, e.g. to check what the caller holds during a slow send. */
  during?: () => Promise<void>;

  async send(message: OutboundMessage): Promise<void> {
    await this.during?.();
    if (this.failNext) {
      this.failNext = false;
      throw new Error('Kafka is unavailable');
    }
    this.sent.push(message);
  }
}
