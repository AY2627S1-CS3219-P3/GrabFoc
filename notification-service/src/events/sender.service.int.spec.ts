/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Generated the sending tests against PostgreSQL (#153), with the User client and mailer faked.
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Added the retry pass and superseded-email tests (#154).
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
 * Scope: Added tests for OrderChangeRequest (#186).
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
 * Scope: Added tests that a proposal's resolution supersedes its CREATED email waiting for a retry
 *        (#186, from Jie Yang's review).
 * Author review: pending — Jie Yang to record the review.
 */
// AI-generated (pending review)
import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { MailError, Mailer } from '../mail/mailer';
import { RenderedEmail } from '../mail/templates';
import { OrderEvent, OrderStatus } from '../messaging/messages';
import { emptyTables, openTestDatabase } from '../test/database';
import { UserClient, UserLookupError } from '../users/user.client';
import { OrderEventsService } from './order-events.service';
import { SenderService, SUPERSEDED } from './sender.service';

/** Each user's address is their id at foc.test; ids in `missing` are unknown to User, and `down` fails every lookup. */
class FakeUsers {
  missing = new Set<string>();
  down = false;
  async contactEmail(userId: string): Promise<string> {
    if (this.down) throw new UserLookupError('USER_UNAVAILABLE');
    if (this.missing.has(userId)) throw new UserLookupError('USER_NOT_FOUND');
    return `${userId}@foc.test`;
  }
}

/** Records what was sent; sends to addresses in `refuse` fail like an SMTP 550, and `down` like a dead server. */
class FakeMailer {
  sent: { to: string; email: RenderedEmail }[] = [];
  refuse = new Set<string>();
  down = false;
  async send(to: string, email: RenderedEmail): Promise<string> {
    if (this.down) throw new MailError('ESOCKET');
    if (this.refuse.has(to)) throw new MailError('SMTP_550');
    this.sent.push({ to, email });
    return `<${this.sent.length}@foc.test>`;
  }
}

let pool: Pool;
let events: OrderEventsService;
let users: FakeUsers;
let mailer: FakeMailer;
let sender: SenderService;

beforeAll(async () => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  pool = await openTestDatabase();
  events = new OrderEventsService(pool);
});
afterAll(async () => {
  await pool?.end();
  jest.restoreAllMocks();
});
beforeEach(async () => {
  await emptyTables(pool);
  users = new FakeUsers();
  mailer = new FakeMailer();
  sender = new SenderService(pool, users as unknown as UserClient, mailer as unknown as Mailer);
});

const requesterId = randomUUID();
const courierId = randomUUID();

function event(status: OrderStatus, overrides: Partial<OrderEvent> = {}): OrderEvent {
  return {
    eventId: randomUUID(),
    eventType: `Order${status}`,
    occurredAt: new Date(),
    orderId: randomUUID(),
    requesterId,
    courierId,
    status,
    reason: null,
    ...overrides,
  };
}

async function rows(eventId: string) {
  const { rows } = await pool.query(
    `SELECT role, delivery_status, attempts, last_error, provider_message_id, sent_at
       FROM notifications WHERE event_id = $1 ORDER BY role`,
    [eventId],
  );
  return rows;
}
async function outcomeOf(eventId: string): Promise<{ outcome: string; handled_at: Date | null }> {
  const { rows } = await pool.query('SELECT outcome, handled_at FROM notification_events WHERE event_id = $1', [eventId]);
  return rows[0];
}

it('emails both parties on completion and marks the event handled', async () => {
  const completed = event('COMPLETED');
  await events.handle(completed);

  await expect(sender.sendPending(completed.eventId)).resolves.toEqual({ sent: 2, failed: 0, superseded: 0, retryable: [] });

  expect(mailer.sent.map((m) => m.to)).toEqual([`${requesterId}@foc.test`, `${courierId}@foc.test`]);
  expect(mailer.sent[0].email.subject).toBe('Your order is complete');
  expect(mailer.sent[1].email.subject).toBe('You completed a delivery');
  const saved = await rows(completed.eventId);
  expect(saved).toMatchObject([
    { role: 'REQUESTER', delivery_status: 'SENT', attempts: 1, last_error: null, provider_message_id: '<1@foc.test>' },
    { role: 'COURIER', delivery_status: 'SENT', attempts: 1, last_error: null, provider_message_id: '<2@foc.test>' },
  ]);
  expect(saved[0].sent_at).toBeInstanceOf(Date);
  const { outcome, handled_at } = await outcomeOf(completed.eventId);
  expect(outcome).toBe('HANDLED');
  expect(handled_at).toBeInstanceOf(Date);
});

it('sends nothing the second time', async () => {
  const accepted = event('ACCEPTED');
  await events.handle(accepted);
  await sender.sendPending(accepted.eventId);

  await expect(events.handle(accepted)).resolves.toBe('DUPLICATE');
  await expect(sender.sendPending(accepted.eventId)).resolves.toEqual({ sent: 0, failed: 0, superseded: 0, retryable: [] });
  expect(mailer.sent).toHaveLength(1);
});

it('sends what is still PENDING after a crash part-way', async () => {
  const completed = event('COMPLETED');
  await events.handle(completed);
  // As if the requester's email went out and the process died before the courier's.
  await pool.query(
    `UPDATE notifications SET delivery_status = 'SENT', attempts = 1, sent_at = now() WHERE event_id = $1 AND role = 'REQUESTER'`,
    [completed.eventId],
  );

  await expect(sender.sendPending(completed.eventId)).resolves.toEqual({ sent: 1, failed: 0, superseded: 0, retryable: [] });
  expect(mailer.sent.map((m) => m.to)).toEqual([`${courierId}@foc.test`]);
  expect((await outcomeOf(completed.eventId)).outcome).toBe('HANDLED');
});

it('saves a failed lookup and a failed send as FAILED with only the category', async () => {
  const completed = event('COMPLETED');
  await events.handle(completed);
  users.missing.add(requesterId);
  mailer.refuse.add(`${courierId}@foc.test`);

  await expect(sender.sendPending(completed.eventId)).resolves.toEqual({ sent: 0, failed: 2, superseded: 0, retryable: [] });
  expect(await rows(completed.eventId)).toMatchObject([
    { role: 'REQUESTER', delivery_status: 'FAILED', attempts: 1, last_error: 'USER_NOT_FOUND', sent_at: null },
    { role: 'COURIER', delivery_status: 'FAILED', attempts: 1, last_error: 'SMTP_550', sent_at: null },
  ]);
  // Every email has a saved result, so the event is handled; retrying FAILED rows is #154.
  expect((await outcomeOf(completed.eventId)).outcome).toBe('HANDLED');
});

it('still sends to the courier when the requester fails', async () => {
  const cancelled = event('CANCELLED', { reason: 'MUTUAL_CANCELLATION' });
  await events.handle(cancelled);
  users.missing.add(requesterId);

  await expect(sender.sendPending(cancelled.eventId)).resolves.toEqual({ sent: 1, failed: 1, superseded: 0, retryable: [] });
  expect(mailer.sent[0].email.text).toContain('You and the requester agreed to cancel it.');
});

it('leaves discarded events as they are', async () => {
  const pending = event('PENDING', { courierId: null });
  await expect(events.handle(pending)).resolves.toBe('DISCARDED_NO_AUDIENCE');
  await expect(sender.sendPending(pending.eventId)).resolves.toEqual({ sent: 0, failed: 0, superseded: 0, retryable: [] });
  expect((await outcomeOf(pending.eventId)).outcome).toBe('DISCARDED_NO_AUDIENCE');
});

it('throws a database error, so the message is read again', async () => {
  const accepted = event('ACCEPTED');
  await events.handle(accepted);
  const broken = new Pool({ connectionString: 'postgres://nobody@127.0.0.1:1/nothing', connectionTimeoutMillis: 500 });
  try {
    const failing = new SenderService(broken, users as unknown as UserClient, mailer as unknown as Mailer);
    await expect(failing.sendPending(accepted.eventId)).rejects.toThrow();
  } finally {
    await broken.end();
  }
  expect(mailer.sent).toHaveLength(0);
});

describe('retries (#154)', () => {
  it('reports emails that may succeed later, and sends them on the retry', async () => {
    const completed = event('COMPLETED');
    await events.handle(completed);
    mailer.down = true;
    await expect(sender.sendPending(completed.eventId)).resolves.toEqual({
      sent: 0,
      failed: 0,
      superseded: 0,
      retryable: ['ESOCKET', 'ESOCKET'],
    });

    mailer.down = false;
    await expect(sender.retryFailed(completed.eventId)).resolves.toEqual({ sent: 2, failed: 0, superseded: 0, retryable: [] });
    expect(await rows(completed.eventId)).toMatchObject([
      { role: 'REQUESTER', delivery_status: 'SENT', attempts: 2, last_error: null },
      { role: 'COURIER', delivery_status: 'SENT', attempts: 2, last_error: null },
    ]);
  });

  it('counts a User outage as retryable', async () => {
    const accepted = event('ACCEPTED');
    await events.handle(accepted);
    users.down = true;
    await expect(sender.sendPending(accepted.eventId)).resolves.toMatchObject({ retryable: ['USER_UNAVAILABLE'] });
  });

  it('retries only the failures that may clear up', async () => {
    const completed = event('COMPLETED');
    await events.handle(completed);
    users.missing.add(requesterId);
    mailer.down = true;
    await sender.sendPending(completed.eventId);

    mailer.down = false;
    await expect(sender.retryFailed(completed.eventId)).resolves.toEqual({ sent: 1, failed: 0, superseded: 0, retryable: [] });
    expect(mailer.sent.map((m) => m.to)).toEqual([`${courierId}@foc.test`]);
    expect(await rows(completed.eventId)).toMatchObject([
      { role: 'REQUESTER', delivery_status: 'FAILED', attempts: 1, last_error: 'USER_NOT_FOUND' },
      { role: 'COURIER', delivery_status: 'SENT' },
    ]);
  });

  it('sends nothing on a retry once every email is out', async () => {
    const accepted = event('ACCEPTED');
    await events.handle(accepted);
    await sender.sendPending(accepted.eventId);
    await expect(sender.retryFailed(accepted.eventId)).resolves.toEqual({ sent: 0, failed: 0, superseded: 0, retryable: [] });
    expect(mailer.sent).toHaveLength(1);
  });

  it('drops a retried email once the order has moved on', async () => {
    const orderId = randomUUID();
    const accepted = event('ACCEPTED', { orderId });
    await events.handle(accepted);
    mailer.down = true;
    await sender.sendPending(accepted.eventId);

    mailer.down = false;
    const pickedUp = event('PICKED_UP', { orderId });
    await events.handle(pickedUp);
    await sender.sendPending(pickedUp.eventId);

    await expect(sender.retryFailed(accepted.eventId)).resolves.toEqual({ sent: 0, failed: 0, superseded: 1, retryable: [] });
    expect(mailer.sent.map((m) => m.email.subject)).toEqual(['Your items have been picked up']);
    expect(await rows(accepted.eventId)).toMatchObject([{ delivery_status: 'FAILED', last_error: SUPERSEDED }]);
  });

  it('drops a pending email when a later state was handled first', async () => {
    const orderId = randomUUID();
    const accepted = event('ACCEPTED', { orderId });
    await events.handle(accepted);
    // The later event is recorded before the first one's emails went out (e.g. a crash in between).
    await events.handle(event('PICKED_UP', { orderId }));

    await expect(sender.sendPending(accepted.eventId)).resolves.toMatchObject({ sent: 0, superseded: 1 });
    expect(mailer.sent).toHaveLength(0);
  });

  it('keeps an email for the same state, and never supersedes a final state', async () => {
    const orderId = randomUUID();
    const completed = event('COMPLETED', { orderId });
    await events.handle(completed);
    mailer.down = true;
    await sender.sendPending(completed.eventId);

    // A later CANCELLED is blocked by the final state, so the order's last state stays COMPLETED.
    await expect(events.handle(event('CANCELLED', { orderId }))).resolves.toBe('DISCARDED_STALE');
    mailer.down = false;
    await expect(sender.retryFailed(completed.eventId)).resolves.toMatchObject({ sent: 2, superseded: 0 });
  });
});

describe('OrderChangeRequest (#186)', () => {
  const proposal = (orderId: string, status: OrderStatus, outcome: 'CREATED' | 'REJECTED'): OrderEvent =>
    event(status, {
      orderId,
      eventType: 'OrderChangeRequest',
      change: {
        outcome,
        kind: 'CANCELLATION',
        proposedBy: courierId,
        confirmationId: randomUUID(),
        proposedWindowStart: null,
        proposedWindowEnd: null,
      },
    });

  it('sends the proposal email even when no state was handled for the order yet', async () => {
    const proposed = proposal(randomUUID(), 'ACCEPTED', 'CREATED');
    await events.handle(proposed);
    expect(await sender.sendPending(proposed.eventId)).toMatchObject({ sent: 1, superseded: 0 });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe(`${requesterId}@foc.test`);
    expect(mailer.sent[0].email.subject).toBe('Request to cancel your order');
  });

  it('drops a proposal email once the order has moved on', async () => {
    const orderId = randomUUID();
    await events.handle(event('ACCEPTED', { orderId }));
    const proposed = proposal(orderId, 'ACCEPTED', 'CREATED');
    await events.handle(proposed);
    await events.handle(event('CANCELLED', { orderId, reason: 'MUTUAL_CANCELLATION' }));
    expect(await sender.sendPending(proposed.eventId)).toMatchObject({ sent: 0, superseded: 1 });
    expect(mailer.sent).toHaveLength(0);
  });

  it('tells the proposer about a rejection', async () => {
    const orderId = randomUUID();
    await events.handle(event('ACCEPTED', { orderId }));
    const rejected = proposal(orderId, 'ACCEPTED', 'REJECTED');
    await events.handle(rejected);
    await sender.sendPending(rejected.eventId);
    expect(mailer.sent.map((m) => m.to)).toEqual([`${courierId}@foc.test`]);
    expect(mailer.sent[0].email.text).toContain('The requester rejected your request to cancel the order.');
  });
});

describe('a resolved proposal supersedes its unsent CREATED email (#186)', () => {
  type Outcome = 'CREATED' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  const change = (orderId: string, confirmationId: string, outcome: Outcome): OrderEvent =>
    event('ACCEPTED', {
      orderId,
      eventType: 'OrderChangeRequest',
      change: {
        outcome,
        kind: 'TIMING_CHANGE',
        proposedBy: courierId,
        confirmationId,
        proposedWindowStart: new Date('2026-11-11T04:00:00.000Z'),
        proposedWindowEnd: new Date('2026-11-11T06:00:00.000Z'),
      },
    });

  /** A CREATED email to the requester that failed because User was down: waiting for a retry. */
  async function failedProposal(): Promise<{ orderId: string; confirmationId: string; created: OrderEvent }> {
    const orderId = randomUUID();
    const confirmationId = randomUUID();
    await events.handle(event('ACCEPTED', { orderId }));
    const created = change(orderId, confirmationId, 'CREATED');
    await events.handle(created);
    users.down = true;
    expect((await sender.sendPending(created.eventId)).retryable).toEqual(['USER_UNAVAILABLE']);
    users.down = false;
    return { orderId, confirmationId, created };
  }

  it.each(['REJECTED', 'EXPIRED', 'APPROVED'] as const)(
    'drops the waiting request email once the proposal is %s, and the retry sends nothing',
    async (outcome) => {
      const { orderId, confirmationId, created } = await failedProposal();
      await events.handle(change(orderId, confirmationId, outcome));

      expect(await rows(created.eventId)).toMatchObject([{ role: 'REQUESTER', delivery_status: 'FAILED', last_error: SUPERSEDED }]);
      expect(await sender.retryFailed(created.eventId)).toMatchObject({ sent: 0, retryable: [] });
      expect(mailer.sent.filter((m) => m.email.subject === 'New delivery window proposed')).toHaveLength(0);
    },
  );

  it('still sends the resolution email itself', async () => {
    const { orderId, confirmationId } = await failedProposal();
    const rejected = change(orderId, confirmationId, 'REJECTED');
    await events.handle(rejected);
    await sender.sendPending(rejected.eventId);
    expect(mailer.sent.map((m) => [m.to, m.email.subject])).toEqual([
      [`${courierId}@foc.test`, 'Your new delivery window was rejected'],
    ]);
  });

  it('supersedes in the send pass too, if the row was never marked', async () => {
    const { orderId, confirmationId, created } = await failedProposal();
    await events.handle(change(orderId, confirmationId, 'REJECTED'));
    // As if the resolution had been recorded without marking the row (e.g. by an older version).
    await pool.query(`UPDATE notifications SET last_error = 'USER_UNAVAILABLE' WHERE event_id = $1`, [created.eventId]);
    expect(await sender.retryFailed(created.eventId)).toMatchObject({ sent: 0, superseded: 1 });
  });

  it("leaves another proposal's email, and an email that failed for good, alone", async () => {
    const { orderId, created } = await failedProposal();
    await events.handle(change(orderId, randomUUID(), 'REJECTED')); // a different proposal
    expect(await rows(created.eventId)).toMatchObject([{ delivery_status: 'FAILED', last_error: 'USER_UNAVAILABLE' }]);

    const other = randomUUID();
    const lost = change(orderId, other, 'CREATED');
    await events.handle(lost);
    users.missing.add(requesterId);
    await sender.sendPending(lost.eventId);
    users.missing.delete(requesterId);
    await events.handle(change(orderId, other, 'REJECTED'));
    expect(await rows(lost.eventId)).toMatchObject([{ delivery_status: 'FAILED', last_error: 'USER_NOT_FOUND' }]);
  });

  it('discards a CREATED that arrives after its resolution', async () => {
    const orderId = randomUUID();
    const confirmationId = randomUUID();
    await events.handle(change(orderId, confirmationId, 'REJECTED'));
    expect(await events.handle(change(orderId, confirmationId, 'CREATED'))).toBe('DISCARDED_STALE');
  });
});
