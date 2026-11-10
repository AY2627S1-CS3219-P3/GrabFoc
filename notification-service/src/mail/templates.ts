/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Generated the email templates (#153): one subject and message per state and recipient,
 *        the cancellation reason, and a button to the frontend (Jie Yang, 2026-11-02). Templates live
 *        in code (#148).
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Added the account emails (suspended, reinstated, reactivated) with #183's wording, and the
 *        USER_SUSPENDED cancellation reason (#183), as approved by Jie Yang on 2026-11-04.
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
 * Scope: Added the proposal emails (#186): a timing change, cancellation or completion proposed,
 *        and a proposal approved, rejected or expired. Wording to be checked by Jie Yang.
 * Author review: pending — Jie Yang to record the review.
 */
// AI-generated (pending review)
import { RecipientRole } from '../events/recipients';
import { AccountEvent, ChangeKind, ChangeOutcome, OrderStatus } from '../messaging/messages';

export interface EmailInput {
  status: OrderStatus;
  role: RecipientRole;
  orderId: string;
  /** OrderCancelled only: REQUESTER_CANCELLED, MUTUAL_CANCELLATION, EXPIRED or USER_SUSPENDED. */
  reason: string | null;
  /** OrderChangeRequest only (#186): what happened to the proposal. */
  change?: EmailChange | null;
}

export interface EmailChange {
  outcome: ChangeOutcome;
  kind: ChangeKind;
  /** TIMING_CHANGE only. */
  proposedWindowStart: Date | null;
  proposedWindowEnd: Date | null;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

interface Copy {
  subject: string;
  message: string;
}

/** Why an order was cancelled, from Order's reason codes. An unknown code shows no reason. */
const REASONS: Record<string, Record<RecipientRole, string>> = {
  REQUESTER_CANCELLED: {
    REQUESTER: 'You cancelled it.',
    COURIER: 'The requester cancelled it.',
  },
  MUTUAL_CANCELLATION: {
    REQUESTER: 'You and your courier agreed to cancel it.',
    COURIER: 'You and the requester agreed to cancel it.',
  },
  EXPIRED: {
    REQUESTER: 'Its delivery window ended before it was completed.',
    COURIER: 'Its delivery window ended before it was completed.',
  },
  // Order cancels every unfinished order of a suspended user (order-service, UserSuspended).
  USER_SUSPENDED: {
    REQUESTER: 'It was cancelled because an account on this order was suspended.',
    COURIER: 'It was cancelled because an account on this order was suspended.',
  },
};

function copyFor({ status, role, reason }: EmailInput): Copy {
  switch (status) {
    case 'ACCEPTED':
      return { subject: 'A courier accepted your order', message: 'A courier has accepted your order and will pick up your items.' };
    case 'PICKED_UP':
      return { subject: 'Your items have been picked up', message: 'Your courier has picked up your items.' };
    case 'IN_PROGRESS':
      return { subject: 'Your order is on its way', message: 'Your courier is on the way to your drop-off point.' };
    case 'ARRIVED':
      return { subject: 'Your courier has arrived', message: 'Your courier is at your drop-off point.' };
    case 'COMPLETED':
      return role === 'REQUESTER'
        ? { subject: 'Your order is complete', message: 'Your order is complete, and its credits have been paid to your courier.' }
        : { subject: 'You completed a delivery', message: 'The order is complete, and its credits have been added to your balance.' };
    case 'CANCELLED': {
      const why = reason ? REASONS[reason]?.[role] : undefined;
      const sentences =
        role === 'REQUESTER'
          ? ['Your order was cancelled.', why, 'Its reserved credits have been returned to you.']
          : ['An order you accepted was cancelled.', why];
      return {
        subject: role === 'REQUESTER' ? 'Your order was cancelled' : 'An order you accepted was cancelled',
        message: sentences.filter(Boolean).join(' '),
      };
    }
    default:
      // recipientsFor() never queues these.
      throw new Error(`No email for ${status}`);
  }
}

/** Campus time, e.g. "10 Nov 2026, 3:00 pm". */
const formatTime = (value: Date) =>
  new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short' }).format(value);

const REJECTED_COPY: Record<ChangeKind, { subject: string; request: (window: string) => string; after: string }> = {
  TIMING_CHANGE: {
    subject: 'Your new delivery window was rejected',
    request: (window) => `change the delivery window to ${window}`,
    after: 'The order keeps its current window.',
  },
  CANCELLATION: { subject: 'Your cancellation request was rejected', request: () => 'cancel the order', after: 'The order carries on.' },
  COMPLETION: { subject: 'Your completion request was rejected', request: () => 'mark the order complete', after: 'The order stays open.' },
};

/**
 * The email about a proposal (#186). It goes to the other party when the proposal is made and to the
 * proposer when it is resolved, so the person on the other side is always the recipient's
 * counterpart: the courier for a requester, the requester for a courier.
 */
function changeCopy(change: EmailChange, role: RecipientRole): Copy {
  const other = role === 'REQUESTER' ? 'your courier' : 'the requester';
  const Other = other[0].toUpperCase() + other.slice(1);
  const window =
    change.proposedWindowStart && change.proposedWindowEnd
      ? `${formatTime(change.proposedWindowStart)} to ${formatTime(change.proposedWindowEnd)}`
      : 'a new time';
  const yourOrder = role === 'REQUESTER' ? 'your order' : 'an order you accepted';

  if (change.outcome === 'CREATED') {
    if (change.kind === 'TIMING_CHANGE') {
      return {
        subject: 'New delivery window proposed',
        message: `${Other} proposed a new delivery window for ${yourOrder}: ${window}. The current window stays unless you accept it.`,
      };
    }
    if (change.kind === 'CANCELLATION') {
      return {
        subject: `Request to cancel ${yourOrder}`,
        message: `${Other} asked to cancel ${yourOrder}. It is only cancelled if you agree.`,
      };
    }
    return {
      subject: `Request to complete ${yourOrder}`,
      message:
        role === 'REQUESTER'
          ? 'Your courier asked to mark your order complete. Once you agree, its credits are paid to your courier.'
          : 'The requester asked to mark an order you accepted complete. Once you agree, its credits are added to your balance.',
    };
  }
  if (change.outcome === 'APPROVED') {
    // Only a timing change gets here (changeRecipients): an approved completion or cancellation is
    // the OrderCompleted / OrderCancelled email.
    return { subject: 'New delivery window accepted', message: `${Other} accepted your new delivery window: ${window}.` };
  }
  if (change.outcome === 'REJECTED') {
    const copy = REJECTED_COPY[change.kind];
    return { subject: copy.subject, message: `${Other} rejected your request to ${copy.request(window)}. ${copy.after}` };
  }
  // EXPIRED: only a timing change expires: the order's current window, or the proposed one, ended
  // before it was accepted. The wording fits both.
  return {
    subject: 'Your proposed delivery window expired',
    message: `Your proposed delivery window (${window}) can no longer be applied, because a window ended before it was accepted. The order's window is unchanged.`,
  };
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Lays out one email. `note` is a small line under the message; `link` adds the "Open FoC" button.
 * Inline styles and a table-free layout: mail clients drop <style> blocks.
 */
function layout(subject: string, message: string, note: string | null, link: string | null): RenderedEmail {
  const text = [message, note, link && `Open FoC: ${link}`].filter(Boolean).join('\n\n') + '\n';
  const noteHtml = note ? `\n      <p style="margin:0 0 24px;font-size:13px;color:#52525b">${escapeHtml(note)}</p>` : '';
  const button = link
    ? `\n      <a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 20px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold">Open FoC</a>`
    : '';
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px">
      <h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(subject)}</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5">${escapeHtml(message)}</p>${noteHtml}${button}
    </div>
  </body>
</html>
`;
  return { subject, text, html };
}

/** The email for one recipient of one event. The button opens `frontendUrl` (there is no order page yet). */
export function renderEmail(input: EmailInput, frontendUrl: string): RenderedEmail {
  const { subject, message } = input.change ? changeCopy(input.change, input.role) : copyFor(input);
  // The first block of the UUID, enough to tell orders apart in an inbox.
  return layout(subject, message, `Order reference: ${input.orderId.slice(0, 8)}`, frontendUrl);
}

/**
 * The email to a user whose account was suspended or reactivated (#183's wording). It never says why
 * the account was suspended: the event doesn't carry the reason. Only a reactivated user gets the
 * button, since a suspended one can't log in.
 */
export function renderAccountEmail(
  event: Pick<AccountEvent, 'type' | 'previousStatus'>,
  frontendUrl: string,
): RenderedEmail {
  if (event.type === 'UserSuspended') {
    return layout(
      'Your FoC account has been suspended',
      'Your FoC account has been suspended. Contact an administrator if you think this is a mistake.',
      null,
      null,
    );
  }
  return event.previousStatus === 'SUSPENDED'
    ? layout('Your FoC account has been reinstated', 'Your FoC account has been reinstated. You can log in again.', null, frontendUrl)
    : layout('Your FoC account has been reactivated', 'Your FoC account has been reactivated.', null, frontendUrl);
}
