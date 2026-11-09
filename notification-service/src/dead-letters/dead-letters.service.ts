/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Copied record() from credit-service/src/dead-letters/dead-letters.service.ts (#152). Listing
 *        and replay (the admin endpoints) come with #154.
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-09
 * Scope: These outcome lines go through the log shipper instead of Nest's Logger, so they reach
 *        the Logging Service's store in the shape it stores rather than wrapped in Nest's own
 *        timestamp, PID and context envelope for a collector to dig out (issue #52).
 * Author review: Cole Lin, read and approved.
 */
import { log } from '../common/log';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../db/database';
import { HEADER, InboundMessage, peekIds } from '../messaging/messages';

/** PostgreSQL's error code for a unique-constraint violation. */
const UNIQUE_VIOLATION = '23505';

@Injectable()
export class DeadLettersService {
  private readonly logger = new Logger('DeadLetters');

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Copies one message from notification.order-events.dlt into the table. A later death of the same
   * event updates its row and reopens it; an older copy of the same dead letter changes nothing.
   */
  async record(message: InboundMessage): Promise<void> {
    const ids = peekIds(message.value);
    const at = new Date(message.headers[HEADER.deadLetteredAt] ?? '');
    const partition = Number.parseInt(message.headers[HEADER.sourcePartition] ?? '', 10);
    const offset = message.headers[HEADER.sourceOffset];
    // With an event id, a new death of the same event updates its row (and reopens it after a
    // replay). Without one, the original message's position and payload recognise a redelivery.
    const onConflict = ids.eventId
      ? `ON CONFLICT (source_topic, event_id) DO UPDATE SET
              message_key = EXCLUDED.message_key, message_type = EXCLUDED.message_type,
              payload = EXCLUDED.payload, error = EXCLUDED.error, error_code = EXCLUDED.error_code,
              attempts = EXCLUDED.attempts, source_partition = EXCLUDED.source_partition,
              source_offset = EXCLUDED.source_offset, dead_lettered_at = EXCLUDED.dead_lettered_at,
              replayed_at = NULL, replay_claimed_at = NULL
        WHERE notification_dead_letters.dead_lettered_at < EXCLUDED.dead_lettered_at`
      : 'ON CONFLICT (source_topic, source_partition, source_offset, md5(payload)) DO NOTHING';
    try {
      await this.pool.query(
        `INSERT INTO notification_dead_letters
                (event_id, message_key, source_topic, source_partition, source_offset, message_type, payload,
                 error, error_code, attempts, dead_lettered_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ${onConflict}`,
        [
          ids.eventId,
          // TEXT can't hold NUL, and a failed insert would re-read this record forever. The key is
          // for inspection only, so NUL is shown as U+FFFD, as invalid UTF-8 already is.
          message.key?.replace(/\u0000/g, '�') ?? null,
          message.headers[HEADER.sourceTopic] ?? message.topic,
          Number.isNaN(partition) ? null : partition,
          offset && /^\d+$/.test(offset) ? offset : null,
          ids.type,
          message.value ?? Buffer.alloc(0),
          message.headers[HEADER.error] ?? 'Unknown error.',
          message.headers[HEADER.errorCode] ?? null,
          // At least 1, whatever the header says, so a bad header can't break the CHECK (attempts > 0).
          Math.max(1, Math.trunc(Number(message.headers[HEADER.attempt])) || 1),
          Number.isNaN(at.getTime()) ? new Date() : at,
        ],
      );
    } catch (err) {
      // A clash on the other unique key (e.g. an event id seen before under a different position)
      // means this dead letter is already recorded. Skipping it keeps one odd message from blocking
      // every dead letter behind it, which retrying forever would do.
      if ((err as { code?: string }).code !== UNIQUE_VIOLATION) throw err;
      log.emit({
        level: 'warn',
        event: 'dead_letter_already_recorded',
        eventId: ids.eventId,
        sourceTopic: message.headers[HEADER.sourceTopic] ?? message.topic,
      });
    }
  }
}
