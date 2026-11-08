/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Generated the tests for which failed emails are retried (#154).
 * Author review: pending — Jie Yang to record the review.
 */
// AI-generated (pending review)
import { isRetryable, SUPERSEDED } from './sender.service';

describe('isRetryable', () => {
  it.each(['USER_UNAVAILABLE', 'ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNREFUSED', 'ECONNRESET', 'UNKNOWN', 'SMTP_421', 'SMTP_451'])(
    'retries %s',
    (category) => {
      expect(isRetryable(category)).toBe(true);
    },
  );

  it.each(['USER_NOT_FOUND', 'USER_BAD_RESPONSE', 'SMTP_550', 'SMTP_554', 'EAUTH', 'EENVELOPE', SUPERSEDED])(
    'does not retry %s',
    (category) => {
      expect(isRetryable(category)).toBe(false);
    },
  );

  it('does not retry an email with no error', () => {
    expect(isRetryable(null)).toBe(false);
  });
});
