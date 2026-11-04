/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Generated the email sending (#153), as approved by Jie Yang on 2026-11-04: sent right after
 *        the event's transaction, at least once on a crash, FAILED rows left for the retries (#154).
 * Author review: pending — Jie Yang to record the review.
 */
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
  failed: number;
}

interface PendingRow {
  id: string;
  role: RecipientRole;
  recipient_id: string;
  status: OrderStatus;
  order_id: string;
  reason: string | null;
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
  async sendPending(eventId: string): Promise<SendResult> {
    const { rows } = await this.pool.query<PendingRow>(
      `SELECT n.id, n.role, n.recipient_id, e.status, e.order_id, e.reason
         FROM notifications n JOIN notification_events e USING (event_id)
        WHERE n.event_id = $1 AND n.delivery_status = 'PENDING'
        ORDER BY n.role`,
      [eventId],
    );
    const result: SendResult = { sent: 0, failed: 0 };
    for (const row of rows) {
      if (await this.sendOne(eventId, row)) result.sent++;
      else result.failed++;
    }
    // HANDLED once every email has a saved result (AGENTS.md Rules). FAILED counts as a result.
    await this.pool.query(
      `UPDATE notification_events SET outcome = 'HANDLED', handled_at = now()
        WHERE event_id = $1 AND outcome = 'PROCESSING'
          AND NOT EXISTS (SELECT 1 FROM notifications WHERE event_id = $1 AND delivery_status = 'PENDING')`,
      [eventId],
    );
    return result;
  }

  private async sendOne(eventId: string, row: PendingRow): Promise<boolean> {
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
          WHERE id = $1 AND delivery_status = 'PENDING'`,
        [row.id, err.category],
      );
      // Never the address: only ids and the error category.
      this.logger.warn(JSON.stringify({ event: 'notification_failed', eventId, role: row.role, error: err.category }));
      return false;
    }
    await this.pool.query(
      `UPDATE notifications
          SET delivery_status = 'SENT', attempts = attempts + 1, provider_message_id = $2, sent_at = now(), last_error = NULL
        WHERE id = $1 AND delivery_status = 'PENDING'`,
      [row.id, messageId],
    );
    this.logger.log(JSON.stringify({ event: 'notification_sent', eventId, role: row.role }));
    return true;
  }
}
