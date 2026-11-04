/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Generated the sending tests against PostgreSQL (#153), with the User client and mailer faked.
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
import { SenderService } from './sender.service';

/** Each user's address is their id at foc.test; ids in `missing` are unknown to User. */
class FakeUsers {
  missing = new Set<string>();
  async contactEmail(userId: string): Promise<string> {
    if (this.missing.has(userId)) throw new UserLookupError('USER_NOT_FOUND');
    return `${userId}@foc.test`;
  }
}

/** Records what was sent; sends to addresses in `refuse` fail like an SMTP 550. */
class FakeMailer {
  sent: { to: string; email: RenderedEmail }[] = [];
  refuse = new Set<string>();
  async send(to: string, email: RenderedEmail): Promise<string> {
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

  await expect(sender.sendPending(completed.eventId)).resolves.toEqual({ sent: 2, failed: 0 });

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
  await expect(sender.sendPending(accepted.eventId)).resolves.toEqual({ sent: 0, failed: 0 });
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

  await expect(sender.sendPending(completed.eventId)).resolves.toEqual({ sent: 1, failed: 0 });
  expect(mailer.sent.map((m) => m.to)).toEqual([`${courierId}@foc.test`]);
  expect((await outcomeOf(completed.eventId)).outcome).toBe('HANDLED');
});

it('saves a failed lookup and a failed send as FAILED with only the category', async () => {
  const completed = event('COMPLETED');
  await events.handle(completed);
  users.missing.add(requesterId);
  mailer.refuse.add(`${courierId}@foc.test`);

  await expect(sender.sendPending(completed.eventId)).resolves.toEqual({ sent: 0, failed: 2 });
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

  await expect(sender.sendPending(cancelled.eventId)).resolves.toEqual({ sent: 1, failed: 1 });
  expect(mailer.sent[0].email.text).toContain('You and the requester agreed to cancel it.');
});

it('leaves discarded events as they are', async () => {
  const pending = event('PENDING', { courierId: null });
  await expect(events.handle(pending)).resolves.toBe('DISCARDED_NO_AUDIENCE');
  await expect(sender.sendPending(pending.eventId)).resolves.toEqual({ sent: 0, failed: 0 });
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
