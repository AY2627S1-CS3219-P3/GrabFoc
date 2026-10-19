/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
 * Scope: Generated these tests for the SupplierDeactivated event shape (issue #120).
 * Author review: pending — Jie Yang to record what he checked.
 */
import { supplierDeactivated } from './supplier-events';

it('builds the SupplierDeactivated contract from issue #120', () => {
  const event = supplierDeactivated(12, new Date('2026-10-19T08:00:00Z'));
  expect(event).toEqual({
    eventId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
    eventType: 'SupplierDeactivated',
    occurredAt: '2026-10-19T08:00:00.000Z',
    data: { locationId: 12 },
  });
});

it('gives every event its own id', () => {
  expect(supplierDeactivated(1).eventId).not.toBe(supplierDeactivated(1).eventId);
});
