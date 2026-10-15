/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated the dead-letter table access: copy from both DLTs, list, and replay credit
 *        commands (Jian Bing's decisions K3, K4 and K11; spec §9.2). Rows are unique per source
 *        topic and event id, so one source can't overwrite another's (security review).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { ErrorCode } from '../common/error-codes';
import { ProblemException } from '../common/problem';
import { PG_POOL } from '../db/database';
import { HEADER, InboundMessage, peekIds, Publisher, PUBLISHER } from '../messaging/messages';
import { Topics, TOPICS } from '../messaging/topics';

export type DeadLetterStatus = 'open' | 'replayed' | 'all';

export interface DeadLetter {
  eventId: string | null;
  orderId: string | null;
  sourceTopic: string;
  commandType: string | null;
  payload: string;
  error: string;
  errorCode: string | null;
  attempts: number;
  deadLetteredAt: string;
  replayedAt: string | null;
}

interface DeadLetterRow {
  event_id: string | null;
  order_id: string | null;
  source_topic: string;
  command_type: string | null;
  payload: string;
  error: string;
  error_code: string | null;
  attempts: number;
  dead_lettered_at: Date;
  replayed_at: Date | null;
}

const COLUMNS =
  'event_id, order_id, source_topic, command_type, payload, error, error_code, attempts, dead_lettered_at, replayed_at';

const WHERE: Record<DeadLetterStatus, string> = {
  open: 'WHERE replayed_at IS NULL',
  replayed: 'WHERE replayed_at IS NOT NULL',
  all: '',
};

function toDeadLetter(row: DeadLetterRow): DeadLetter {
  return {
    eventId: row.event_id,
    orderId: row.order_id,
    sourceTopic: row.source_topic,
    commandType: row.command_type,
    payload: row.payload,
    error: row.error,
    errorCode: row.error_code,
    attempts: row.attempts,
    deadLetteredAt: row.dead_lettered_at.toISOString(),
    replayedAt: row.replayed_at?.toISOString() ?? null,
  };
}

@Injectable()
export class DeadLettersService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(PUBLISHER) private readonly publisher: Publisher,
    @Inject(TOPICS) private readonly topics: Topics,
  ) {}

  /**
   * Copies one message from a dead-letter topic into the table. A command that dies again after
   * a replay updates its row and reopens it; an older copy of the same dead letter changes nothing.
   */
  async record(message: InboundMessage): Promise<void> {
    const ids = peekIds(message.value);
    const at = new Date(message.headers[HEADER.deadLetteredAt] ?? '');
    await this.pool.query(
      `INSERT INTO credit_dead_letters
              (event_id, order_id, source_topic, command_type, payload, error, error_code, attempts, dead_lettered_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (source_topic, event_id) DO UPDATE SET
              order_id = EXCLUDED.order_id, command_type = EXCLUDED.command_type, payload = EXCLUDED.payload, error = EXCLUDED.error,
              error_code = EXCLUDED.error_code, attempts = EXCLUDED.attempts,
              dead_lettered_at = EXCLUDED.dead_lettered_at, replayed_at = NULL
        WHERE credit_dead_letters.dead_lettered_at < EXCLUDED.dead_lettered_at`,
      [
        ids.eventId,
        ids.orderId,
        message.headers[HEADER.sourceTopic] ?? message.topic,
        ids.type,
        message.value?.toString('utf8') ?? '',
        message.headers[HEADER.error] ?? 'Unknown error.',
        message.headers[HEADER.errorCode] ?? null,
        Number(message.headers[HEADER.attempt]) || 1,
        Number.isNaN(at.getTime()) ? new Date() : at,
      ],
    );
  }

  /** The newest 100 dead letters with the given status. */
  async list(status: DeadLetterStatus): Promise<DeadLetter[]> {
    const { rows } = await this.pool.query<DeadLetterRow>(
      `SELECT ${COLUMNS} FROM credit_dead_letters ${WHERE[status]}
        ORDER BY dead_lettered_at DESC, id DESC LIMIT 100`,
    );
    return rows.map(toDeadLetter);
  }

  /** Sends a dead credit command back to credit.commands with a fresh attempt count, at most once. */
  async replay(eventId: string): Promise<DeadLetter> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Only credit commands can be replayed, so look up the command's row. The row lock makes a
      // second, concurrent replay wait and then see replayed_at set.
      const { rows } = await client.query<DeadLetterRow>(
        `SELECT ${COLUMNS} FROM credit_dead_letters WHERE source_topic = $1 AND event_id = $2 FOR UPDATE`,
        [this.topics.commands, eventId],
      );
      const row = rows[0];
      if (!row) {
        const other = await client.query<{ source_topic: string }>(
          'SELECT source_topic FROM credit_dead_letters WHERE event_id = $1 LIMIT 1',
          [eventId],
        );
        if (other.rows[0]) {
          throw new ProblemException(
            409,
            `Dead letter ${eventId} came from ${other.rows[0].source_topic}; fix it and publish it again from its source.`,
            ErrorCode.NOT_REPLAYABLE,
          );
        }
        throw new ProblemException(404, `No dead letter has event id ${eventId}.`, ErrorCode.DEAD_LETTER_NOT_FOUND);
      }
      if (row.replayed_at) {
        throw new ProblemException(409, `Dead letter ${eventId} was already replayed.`, ErrorCode.ALREADY_REPLAYED);
      }
      // Publish before committing: if Kafka refuses, the row stays open and can be replayed again.
      // If the commit then fails, the command may be sent twice, which the handlers already absorb.
      await this.publisher.send({ topic: this.topics.commands, key: row.order_id, value: row.payload, headers: {} });
      const updated = await client.query<DeadLetterRow>(
        `UPDATE credit_dead_letters SET replayed_at = now() WHERE source_topic = $1 AND event_id = $2
         RETURNING ${COLUMNS}`,
        [this.topics.commands, eventId],
      );
      await client.query('COMMIT');
      return toDeadLetter(updated.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
