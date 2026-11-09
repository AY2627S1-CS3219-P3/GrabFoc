/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Generated the email sending (#153), as approved by Jie Yang on 2026-11-04: sent right after
 *        the event's transaction, at least once on a crash, FAILED rows left for the retries (#154).
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Added the retry pass, which failures are retried, and dropping emails for an order that has
 *        moved on (#154), as decided by Jie Yang on 2026-11-04.
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-09
 * Scope: These outcome lines go through the log shipper instead of Nest's Logger, so they reach
 *        the Logging Service's store in the shape it stores rather than wrapped in Nest's own
 *        timestamp, PID and context envelope for a collector to dig out (issue #52).
 * Author review: Cole Lin, read and approved.
 */
import { log } from '../common/log';
// AI-generated (pending review)
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { config } from '../config';
import { PG_POOL } from '../db/database';
import { MailError, Mailer } from '../mail/mailer';
import { renderEmail } from '../mail/templates';
import { OrderStatus } from '../messaging/messages';
import { UserClient, UserLookupError } from '../users/user.client';
import { RecipientRole } from './recipients';

export interface SendResult {
  sent: number;
  /** Failed for good: not retried. */
  failed: number;
  /** Dropped because the order had moved on to a later state. */
  superseded: number;
  /** The error categories of emails that failed but may succeed later. Empty when there are none. */
  retryable: string[];
}

/** `last_error` of an email dropped because the order had moved on before it was sent. */
export const SUPERSEDED = 'SUPERSEDED';

/**
 * Connection and timeout errors that may clear up: User or the SMTP server being down or restarting.
 * UNKNOWN is retried too, as Credit does with errors it can't classify.
 */
const RETRYABLE = new Set(['USER_UNAVAILABLE', 'ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNREFUSED', 'ECONNRESET', 'UNKNOWN']);

/**
 * Whether a failed email is worth sending again (Jie Yang, 2026-11-04). Also SMTP 4xx, which are
 * temporary by definition. Never retried: USER_NOT_FOUND, USER_BAD_RESPONSE, SMTP 5xx and errors such
 * as EAUTH that need a person to fix the settings.
 */
export function isRetryable(category: string | null): boolean {
  return category !== null && (RETRYABLE.has(category) || /^SMTP_4\d\d$/.test(category));
}

interface Row {
  id: string;
  role: RecipientRole;
  recipient_id: string;
  status: OrderStatus;
  order_id: string;
  reason: string | null;
  last_error: string | null;
  /** The order has been handled in a later state than this event's. */
  superseded: boolean;
}

@Injectable()
export class SenderService {
  private readonly logger = new Logger('Sender');

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly users: UserClient,
    private readonly mailer: Mailer,
  ) {}

  /**
   * Sends every PENDING email of one event and saves each result. Called after every delivery of the
   * event, duplicates included, so a crash before a result was saved sends that email on the
   * redelivery: at least once. Only database errors are thrown, so the message is read again.
   */
  sendPending(eventId: string): Promise<SendResult> {
    return this.pass(eventId, () => true, `n.delivery_status = 'PENDING'`);
  }

  /** Sends again the event's FAILED emails whose error may have cleared up (#154). */
  retryFailed(eventId: string): Promise<SendResult> {
    return this.pass(eventId, (row) => isRetryable(row.last_error), `n.delivery_status = 'FAILED'`);
  }

  private async pass(eventId: string, include: (row: Row) => boolean, where: string): Promise<SendResult> {
    // Ranks as in the stale check (#148): both final states rank 6, so a final-state email is never
    // superseded, and a repeat of the same state doesn't supersede the earlier one.
    const { rows } = await this.pool.query<Row>(
      `SELECT n.id, n.role, n.recipient_id, e.status, e.order_id, e.reason, n.last_error,
              order_status_rank(s.last_status) > order_status_rank(e.status) AS superseded
         FROM notifications n
         JOIN notification_events e USING (event_id)
         JOIN notification_order_states s ON s.order_id = e.order_id
        WHERE n.event_id = $1 AND ${where}
        ORDER BY n.role`,
      [eventId],
    );
    const result: SendResult = { sent: 0, failed: 0, superseded: 0, retryable: [] };
    for (const row of rows.filter(include)) {
      if (row.superseded) {
        await this.supersede(eventId, row);
        result.superseded++;
        continue;
      }
      const error = await this.sendOne(eventId, row);
      if (error === null) result.sent++;
      else if (isRetryable(error)) result.retryable.push(error);
      else result.failed++;
    }
    // HANDLED once every email has a saved result (AGENTS.md Rules). FAILED counts as a result: a
    // retry changes rows, not the event's outcome.
    await this.pool.query(
      `UPDATE notification_events SET outcome = 'HANDLED', handled_at = now()
        WHERE event_id = $1 AND outcome = 'PROCESSING'
          AND NOT EXISTS (SELECT 1 FROM notifications WHERE event_id = $1 AND delivery_status = 'PENDING')`,
      [eventId],
    );
    return result;
  }

  /**
   * The order moved on before this email went out (Jie Yang, 2026-11-04): a later email already says
   * more, and sending this one now would arrive out of sequence (AGENTS.md Edge cases).
   */
  private async supersede(eventId: string, row: Row): Promise<void> {
    await this.pool.query(
      `UPDATE notifications SET delivery_status = 'FAILED', last_error = $2
        WHERE id = $1 AND delivery_status IN ('PENDING', 'FAILED')`,
      [row.id, SUPERSEDED],
    );
    // Not `role` and `status`: those are envelope fields with different meanings - an HTTP status
    // and an ADMIN/USER role - and the store refuses the *whole line* when a field is outside its
    // schema, so `role: 'COURIER'` would have had every one of these lines dead-lettered instead
    // of stored. Under these names they land in `extra`, which is where they belong.
    log.emit({
      level: 'info',
      event: 'notification_superseded',
      eventId,
      recipientRole: row.role,
      orderStatus: row.status,
    });
  }

  /** Sends one email and saves the result. Returns null when sent, else the error category. */
  private async sendOne(eventId: string, row: Row): Promise<string | null> {
    let messageId: string | null;
    try {
      const to = await this.users.contactEmail(row.recipient_id);
      const email = renderEmail(
        { status: row.status, role: row.role, orderId: row.order_id, reason: row.reason },
        config.frontendUrl,
      );
      messageId = await this.mailer.send(to, email);
    } catch (err) {
      if (!(err instanceof UserLookupError || err instanceof MailError)) throw err;
      await this.pool.query(
        `UPDATE notifications SET delivery_status = 'FAILED', attempts = attempts + 1, last_error = $2
          WHERE id = $1 AND delivery_status IN ('PENDING', 'FAILED')`,
        [row.id, err.category],
      );
      // Never the address: only ids and the error category.
      log.emit({
        level: 'warn',
        event: 'notification_failed',
        eventId,
        recipientRole: row.role,
        error: err.category,
        retryable: isRetryable(err.category),
      });
      return err.category;
    }
    await this.pool.query(
      `UPDATE notifications
          SET delivery_status = 'SENT', attempts = attempts + 1, provider_message_id = $2, sent_at = now(), last_error = NULL
        WHERE id = $1 AND delivery_status IN ('PENDING', 'FAILED')`,
      [row.id, messageId],
    );
    log.emit({ level: 'info', event: 'notification_sent', eventId, recipientRole: row.role });
    return null;
  }
}
