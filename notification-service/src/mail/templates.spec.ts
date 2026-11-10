/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Generated the email template tests (#153).
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Added the account email and USER_SUSPENDED reason tests (#183).
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
 * Scope: Added tests for OrderChangeRequest (#186).
 * Author review: pending — Jie Yang to record the review.
 */
// AI-generated (pending review)
import { renderAccountEmail, renderEmail } from './templates';

const ORDER = '3f2a9c1e-0000-4000-8000-000000000001';
const URL = 'https://foc.test';

describe('renderEmail', () => {
  it.each(['ACCEPTED', 'PICKED_UP', 'IN_PROGRESS', 'ARRIVED', 'COMPLETED'] as const)(
    'has a subject, the order reference and the button for %s',
    (status) => {
      const email = renderEmail({ status, role: 'REQUESTER', orderId: ORDER, reason: null }, URL);
      expect(email.subject).not.toBe('');
      expect(email.text).toContain('Order reference: 3f2a9c1e');
      expect(email.text).toContain(`Open FoC: ${URL}`);
      expect(email.html).toContain(`href="${URL}"`);
      expect(email.html).toContain('Open FoC</a>');
    },
  );

  it('tells the requester and the courier different things on completion', () => {
    const requester = renderEmail({ status: 'COMPLETED', role: 'REQUESTER', orderId: ORDER, reason: null }, URL);
    const courier = renderEmail({ status: 'COMPLETED', role: 'COURIER', orderId: ORDER, reason: null }, URL);
    expect(requester.text).toMatch(/paid to your courier/);
    expect(courier.text).toMatch(/added to your balance/);
  });

  it.each([
    ['REQUESTER_CANCELLED', 'REQUESTER', 'You cancelled it.'],
    ['REQUESTER_CANCELLED', 'COURIER', 'The requester cancelled it.'],
    ['MUTUAL_CANCELLATION', 'COURIER', 'You and the requester agreed to cancel it.'],
    ['EXPIRED', 'REQUESTER', 'Its delivery window ended before it was completed.'],
  ] as const)('shows the %s reason to the %s', (reason, role, sentence) => {
    const email = renderEmail({ status: 'CANCELLED', role, orderId: ORDER, reason }, URL);
    expect(email.text).toContain(sentence);
    expect(email.html).toContain(sentence);
  });

  it('tells the requester their credits came back, and leaves out an unknown reason', () => {
    const email = renderEmail({ status: 'CANCELLED', role: 'REQUESTER', orderId: ORDER, reason: 'SOMETHING_NEW' }, URL);
    expect(email.text.split('\n')[0]).toBe(
      'Your order was cancelled. Its reserved credits have been returned to you.',
    );
  });

  it('escapes the link in the HTML', () => {
    const email = renderEmail({ status: 'ARRIVED', role: 'REQUESTER', orderId: ORDER, reason: null }, 'https://x.test/?a=1&b="2"');
    expect(email.html).toContain('href="https://x.test/?a=1&amp;b=&quot;2&quot;"');
  });

  it('has no email for a state nobody is told about', () => {
    expect(() => renderEmail({ status: 'PENDING', role: 'REQUESTER', orderId: ORDER, reason: null }, URL)).toThrow();
  });
});

describe('USER_SUSPENDED cancellations', () => {
  it.each(['REQUESTER', 'COURIER'] as const)('tell the %s why', (role) => {
    const email = renderEmail({ status: 'CANCELLED', role, orderId: ORDER, reason: 'USER_SUSPENDED' }, URL);
    expect(email.text).toContain('It was cancelled because an account on this order was suspended.');
  });
});

describe('renderAccountEmail', () => {
  it('tells a suspended user, without a reason or a button', () => {
    const email = renderAccountEmail({ type: 'UserSuspended', previousStatus: null }, URL);
    expect(email.subject).toBe('Your FoC account has been suspended');
    expect(email.text).toBe(
      'Your FoC account has been suspended. Contact an administrator if you think this is a mistake.\n',
    );
    expect(email.html).not.toContain('Open FoC');
  });

  it('tells a reinstated user they can log in again, with the button', () => {
    const email = renderAccountEmail({ type: 'UserReactivated', previousStatus: 'SUSPENDED' }, URL);
    expect(email.subject).toBe('Your FoC account has been reinstated');
    expect(email.text).toContain('You can log in again.');
    expect(email.html).toContain(`href="${URL}"`);
  });

  it('tells a user whose deactivated account was reactivated', () => {
    const email = renderAccountEmail({ type: 'UserReactivated', previousStatus: 'DEACTIVATED' }, URL);
    expect(email.subject).toBe('Your FoC account has been reactivated');
    expect(email.text).toContain('Your FoC account has been reactivated.');
  });
});

describe('renderEmail for proposals (#186)', () => {
  const window = {
    proposedWindowStart: new Date('2026-11-10T07:00:00.000Z'),
    proposedWindowEnd: new Date('2026-11-10T09:00:00.000Z'),
  };
  const none = { proposedWindowStart: null, proposedWindowEnd: null };
  const render = (role: 'REQUESTER' | 'COURIER', change: Parameters<typeof renderEmail>[0]['change']) =>
    renderEmail({ status: 'ACCEPTED', role, orderId: ORDER, reason: null, change }, URL);

  it('shows a proposed window in campus time, naming who proposed it', () => {
    const email = render('COURIER', { outcome: 'CREATED', kind: 'TIMING_CHANGE', ...window });
    expect(email.subject).toBe('New delivery window proposed');
    expect(email.text).toContain('The requester proposed a new delivery window for an order you accepted');
    expect(email.text).toMatch(/10 Nov 2026, 3:00\spm to 10 Nov 2026, 5:00\spm/);
    expect(email.text).toContain(`Open FoC: ${URL}`);
  });

  it('asks the requester to agree to a cancellation', () => {
    const email = render('REQUESTER', { outcome: 'CREATED', kind: 'CANCELLATION', ...none });
    expect(email.subject).toBe('Request to cancel your order');
    expect(email.text).toContain('Your courier asked to cancel your order. It is only cancelled if you agree.');
  });

  it('asks the requester to agree to a completion', () => {
    const email = render('REQUESTER', { outcome: 'CREATED', kind: 'COMPLETION', ...none });
    expect(email.text).toContain('paid to your courier');
  });

  it('tells the proposer a timing change was accepted', () => {
    expect(render('REQUESTER', { outcome: 'APPROVED', kind: 'TIMING_CHANGE', ...window }).text).toContain(
      'Your courier accepted your new delivery window',
    );
  });

  it.each([
    ['TIMING_CHANGE', 'The order keeps its current window.'],
    ['CANCELLATION', 'The requester rejected your request to cancel the order. The order carries on.'],
    ['COMPLETION', 'The requester rejected your request to mark the order complete. The order stays open.'],
  ] as const)('tells the proposer a %s was rejected', (kind, sentence) => {
    const email = render('COURIER', { outcome: 'REJECTED', kind, ...(kind === 'TIMING_CHANGE' ? window : none) });
    expect(email.text).toContain(sentence);
    expect(email.html).toContain(sentence);
  });

  it('tells the proposer a timing change expired, in words that fit either window ending', () => {
    const email = render('REQUESTER', { outcome: 'EXPIRED', kind: 'TIMING_CHANGE', ...window });
    expect(email.subject).toBe('Your proposed delivery window expired');
    expect(email.text).toContain('can no longer be applied, because a window ended before it was accepted.');
    expect(email.text).not.toContain('current window ended');
  });
});
