/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Generated the account email tests against PostgreSQL (#183), with the User client and
 *        mailer faked.
 * Author review: pending — Jie Yang to record the review.
 */
// AI-generated (pending review)
import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { MailError, Mailer } from '../mail/mailer';
import { RenderedEmail } from '../mail/templates';
import { AccountEvent } from '../messaging/messages';
import { emptyTables, openTestDatabase } from '../test/database';
import { UserClient, UserLookupError } from '../users/user.client';
import { AccountEmailsService, DISCARDED_OLD, MAX_EVENT_AGE_MS } from './account-emails.service';
import { SUPERSEDED } from './sender.service';

/** Each user's address is their id at foc.test; `missing` users are unknown to User. */
class FakeUsers {
  missing = new Set<string>();
  async contactEmail(userId: string): Promise<string> {
    if (this.missing.has(userId)) throw new UserLookupError('USER_NOT_FOUND');
    return `${userId}@foc.test`;
  }
}

/** Records what was sent; while `down`, every send fails like a dead server. */
class FakeMailer {
  sent: { to: string; email: RenderedEmail }[] = [];
  down = false;
  async send(to: string, email: RenderedEmail): Promise<string> {
    if (this.down) throw new MailError('ESOCKET');
    this.sent.push({ to, email });
    return `<${this.sent.length}@foc.test>`;
  }
}

let pool: Pool;
let users: FakeUsers;
let mailer: FakeMailer;
let service: AccountEmailsService;

beforeAll(async () => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  pool = await openTestDatabase();
});
afterAll(async () => {
  await pool?.end();
  jest.restoreAllMocks();
});
beforeEach(async () => {
  await emptyTables(pool);
  users = new FakeUsers();
  mailer = new FakeMailer();
  service = new AccountEmailsService(pool, users as unknown as UserClient, mailer as unknown as Mailer);
});

const userId = randomUUID();

function suspended(overrides: Partial<AccountEvent> = {}): AccountEvent {
  return { eventId: randomUUID(), type: 'UserSuspended', userId, occurredAt: new Date(), previousStatus: null, ...overrides };
}
function reactivated(previousStatus: 'SUSPENDED' | 'DEACTIVATED', overrides: Partial<AccountEvent> = {}): AccountEvent {
  return { eventId: randomUUID(), type: 'UserReactivated', userId, occurredAt: new Date(), previousStatus, ...overrides };
}

async function row(eventId: string) {
  const { rows } = await pool.query(
    'SELECT event_type, delivery_status, attempts, last_error, provider_message_id, sent_at FROM notification_account_emails WHERE event_id = $1',
    [eventId],
  );
  return rows[0];
}

it('emails a suspended user, once', async () => {
  const event = suspended();
  await expect(service.record(event)).resolves.toBe('QUEUED');
  await expect(service.sendPending(event.eventId)).resolves.toEqual({ sent: 1, failed: 0, superseded: 0, retryable: [] });

  expect(mailer.sent).toHaveLength(1);
  expect(mailer.sent[0].to).toBe(`${userId}@foc.test`);
  expect(mailer.sent[0].email.subject).toBe('Your FoC account has been suspended');
  expect(await row(event.eventId)).toMatchObject({ delivery_status: 'SENT', attempts: 1, provider_message_id: '<1@foc.test>' });

  await expect(service.record(event)).resolves.toBe('DUPLICATE');
  await expect(service.sendPending(event.eventId)).resolves.toMatchObject({ sent: 0 });
  expect(mailer.sent).toHaveLength(1);
});

it.each([
  ['SUSPENDED', 'Your FoC account has been reinstated'],
  ['DEACTIVATED', 'Your FoC account has been reactivated'],
] as const)('emails the right message on reactivation from %s', async (previous, subject) => {
  const event = reactivated(previous);
  await service.record(event);
  await service.sendPending(event.eventId);
  expect(mailer.sent[0].email.subject).toBe(subject);
});

it('records an event over an hour old without emailing it', async () => {
  const now = Date.now();
  const old = suspended({ occurredAt: new Date(now - MAX_EVENT_AGE_MS - 1000) });
  await expect(service.record(old, now)).resolves.toBe('DISCARDED_OLD');
  await expect(service.sendPending(old.eventId)).resolves.toEqual({ sent: 0, failed: 0, superseded: 0, retryable: [] });
  await expect(service.retryFailed(old.eventId)).resolves.toMatchObject({ sent: 0 });
  expect(mailer.sent).toHaveLength(0);
  expect(await row(old.eventId)).toMatchObject({ delivery_status: 'FAILED', attempts: 0, last_error: DISCARDED_OLD });
});

it('reports a send that may succeed later, and sends it on the retry', async () => {
  const event = suspended();
  await service.record(event);
  mailer.down = true;
  await expect(service.sendPending(event.eventId)).resolves.toMatchObject({ sent: 0, retryable: ['ESOCKET'] });

  mailer.down = false;
  await expect(service.retryFailed(event.eventId)).resolves.toMatchObject({ sent: 1, retryable: [] });
  expect(await row(event.eventId)).toMatchObject({ delivery_status: 'SENT', attempts: 2, last_error: null });
});

it('does not retry a user User doesn’t know', async () => {
  const event = suspended();
  await service.record(event);
  users.missing.add(userId);
  await expect(service.sendPending(event.eventId)).resolves.toMatchObject({ failed: 1, retryable: [] });
  await expect(service.retryFailed(event.eventId)).resolves.toMatchObject({ sent: 0, failed: 0 });
  expect(await row(event.eventId)).toMatchObject({ delivery_status: 'FAILED', last_error: 'USER_NOT_FOUND' });
});

it('drops a retried "suspended" email once the account has been reinstated', async () => {
  const at = Date.now();
  const suspension = suspended({ occurredAt: new Date(at - 2000) });
  await service.record(suspension);
  mailer.down = true;
  await service.sendPending(suspension.eventId);

  mailer.down = false;
  const reinstated = reactivated('SUSPENDED', { occurredAt: new Date(at - 1000) });
  await service.record(reinstated);
  await service.sendPending(reinstated.eventId);

  await expect(service.retryFailed(suspension.eventId)).resolves.toMatchObject({ sent: 0, superseded: 1 });
  expect(mailer.sent.map((m) => m.email.subject)).toEqual(['Your FoC account has been reinstated']);
  expect(await row(suspension.eventId)).toMatchObject({ delivery_status: 'FAILED', last_error: SUPERSEDED });
});

it('keeps another user’s emails apart', async () => {
  const other = suspended({ userId: randomUUID(), occurredAt: new Date(Date.now() + 1000) });
  const mine = suspended();
  await service.record(other);
  await service.record(mine);
  await expect(service.sendPending(mine.eventId)).resolves.toMatchObject({ sent: 1, superseded: 0 });
});
