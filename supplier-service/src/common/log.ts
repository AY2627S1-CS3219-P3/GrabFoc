/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Generated this service's shipper instance, from the plan Cole Lin approved on
 *        2026-10-16 (issue #52).
 * Author review: pending — Cole Lin to record what he checked.
 */
import { LogShipper } from './log-shipper';

/**
 * This service's log lines, in the shape the Logging Service stores (issue #52). No publisher is
 * passed, so lines go to stdout only: nothing here depends on a broker, and the service still runs
 * and is testable on its own. When the shared broker (#75) is wired up, a `LinePublisher` is handed
 * in here and nothing else in this service changes.
 */
export const log = new LogShipper({ service: 'supplier' });
