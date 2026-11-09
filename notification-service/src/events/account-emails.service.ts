/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Generated the account emails for UserSuspended and UserReactivated (#183), as approved by
 *        Jie Yang on 2026-11-04: deduplicated on eventId, events over an hour old recorded but not
 *        emailed, superseded by a later account event, retried like order emails.
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
import { renderAccountEmail } from '../mail/templates';
import { AccountEvent, AccountEventType } from '../messaging/messages';
import { UserClient, UserLookupError } from '../users/user.client';
import { isRetryable, SendResult, SUPERSEDED } from './sender.service';

/**
 * An account event older than this is recorded but not emailed. On its first start Notification reads
 * user.events from the beginning, and must not email everyone ever suspended (Jie Yang, 2026-11-04).
 */
export const MAX_EVENT_AGE_MS = 60 * 60 * 1000;

/** `last_error` of an event recorded without an email because it was too old. */
export const DISCARDED_OLD = 'DISCARDED_OLD';

/**
 * - DUPLICATE: its event id was seen before; nothing changed.
 * - DISCARDED_OLD: older than MAX_EVENT_AGE_MS; recorded, never emailed.
 * - QUEUED: one PENDING email, sent next.
 */
export type AccountEventOutcome = 'DUPLICATE' | 'DISCARDED_OLD' | 'QUEUED';

interface Row {
  event_id: string;
  event_type: AccountEventType;
  user_id: string;
  previous_status: 'SUSPENDED' | 'DEACTIVATED' | null;
  last_error: string | null;
  /** A later account event for the same user has been recorded. */
  superseded: boolean;
}

@Injectable()
export class AccountEmailsService {
  private readonly logger = new Logger('AccountEmails');

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly users: UserClient,
    private readonly mailer: Mailer,
  ) {}

  /** Records one event. A single insert, so there is nothing to roll back. */
  async record(event: AccountEvent, now = Date.now()): Promise<AccountEventOutcome> {
    const old = now - event.occurredAt.getTime() > MAX_EVENT_AGE_MS;
    const { rowCount } = await this.pool.query(
      `INSERT INTO notification_account_emails
              (event_id, event_type, user_id, previous_status, occurred_at, delivery_status, last_error)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (event_id) DO NOTHING`,
      [
        event.eventId,
        event.type,
        event.userId,
        event.previousStatus,
        event.occurredAt,
        old ? 'FAILED' : 'PENDING',
        old ? DISCARDED_OLD : null,
      ],
    );
    if (rowCount === 0) return 'DUPLICATE';
    return old ? 'DISCARDED_OLD' : 'QUEUED';
  }

  /**
   * Sends the event's email if it is still PENDING. Called after every delivery of the event,
   * duplicates included, as order emails are: at least once.
   */
  sendPending(eventId: string): Promise<SendResult> {
    return this.pass(eventId, `delivery_status = 'PENDING'`, () => true);
  }

  /** Sends the event's email again if it failed with an error that may have cleared up (#154). */
  retryFailed(eventId: string): Promise<SendResult> {
    return this.pass(eventId, `delivery_status = 'FAILED'`, (row) => isRetryable(row.last_error));
  }

  private async pass(eventId: string, where: string, include: (row: Row) => boolean): Promise<SendResult> {
    const { rows } = await this.pool.query<Row>(
      `SELECT a.event_id, a.event_type, a.user_id, a.previous_status, a.last_error,
              EXISTS (SELECT 1 FROM notification_account_emails l
                       WHERE l.user_id = a.user_id AND l.occurred_at > a.occurred_at) AS superseded
         FROM notification_account_emails a
        WHERE a.event_id = $1 AND ${where}`,
      [eventId],
    );
    const result: SendResult = { sent: 0, failed: 0, superseded: 0, retryable: [] };
    for (const row of rows.filter(include)) {
      if (row.superseded) {
        // e.g. a retried "suspended" email after the account was already reinstated.
        await this.fail(row, SUPERSEDED, false);
        log.emit({ level: 'info', event: 'account_email_superseded', eventId, type: row.event_type });
        result.superseded++;
        continue;
      }
      const error = await this.sendOne(row);
      if (error === null) result.sent++;
      else if (isRetryable(error)) result.retryable.push(error);
      else result.failed++;
    }
    return result;
  }

  /** Sends one email and saves the result. Returns null when sent, else the error category. */
  private async sendOne(row: Row): Promise<string | null> {
    let messageId: string | null;
    try {
      const to = await this.users.contactEmail(row.user_id);
      messageId = await this.mailer.send(
        to,
        renderAccountEmail({ type: row.event_type, previousStatus: row.previous_status }, config.frontendUrl),
      );
    } catch (err) {
      if (!(err instanceof UserLookupError || err instanceof MailError)) throw err;
      await this.fail(row, err.category, true);
      // Never the address: only ids and the error category.
      log.emit({
        level: 'warn',
        event: 'account_email_failed',
        eventId: row.event_id,
        type: row.event_type,
        error: err.category,
        retryable: isRetryable(err.category),
      });
      return err.category;
    }
    await this.pool.query(
      `UPDATE notification_account_emails
          SET delivery_status = 'SENT', attempts = attempts + 1, provider_message_id = $2, sent_at = now(), last_error = NULL
        WHERE event_id = $1 AND delivery_status IN ('PENDING', 'FAILED')`,
      [row.event_id, messageId],
    );
    log.emit({ level: 'info', event: 'account_email_sent', eventId: row.event_id, type: row.event_type });
    return null;
  }

  private async fail(row: Row, error: string, attempted: boolean): Promise<void> {
    await this.pool.query(
      `UPDATE notification_account_emails
          SET delivery_status = 'FAILED', attempts = attempts + $3, last_error = $2
        WHERE event_id = $1 AND delivery_status IN ('PENDING', 'FAILED')`,
      [row.event_id, error, attempted ? 1 : 0],
    );
  }
}
