/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated the insert, query and purge SQL, following the parameterised-query style of
 *        supplier-service/src/locations/locations.service.ts.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Purge on arrival time rather than the producer's timestamp (PR #129 review).
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-23
 * Scope: Count and page in one query, so the total describes the rows returned (PR #129 review).
 * Author review: Cole Lin, read and approved.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../db/database';
import { LineRow, LogQuery } from './line.schema';

// AI-generated (reviewed by Cole Lin).

export interface StoredLine extends LineRow {
  receivedAt: string;
}

export interface LogPage {
  lines: StoredLine[];
  page: number;
  pageSize: number;
  total: number;
}

@Injectable()
export class LinesService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Stores one line. Kafka delivers at least once, so a redelivered line must not become a second
   * row: the primary key on line_id turns that into a no-op. Returns false when the line was
   * already there, which is how the consumer counts duplicates instead of guessing.
   */
  async insert(row: LineRow): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO log_lines (line_id, ts, service, level, event, request_id, user_id, role,
                              method, path, status, duration_ms, extra)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (line_id) DO NOTHING`,
      [
        row.lineId,
        row.ts,
        row.service,
        row.level,
        row.event,
        row.requestId,
        row.userId,
        row.role,
        row.method,
        row.path,
        row.status,
        row.durationMs,
        row.extra,
      ],
    );
    return result.rowCount === 1;
  }

  async query(q: LogQuery): Promise<LogPage> {
    const where: string[] = [];
    const params: unknown[] = [];
    const filter = (sql: string, value: unknown) => {
      params.push(value);
      where.push(sql.replace('$?', `$${params.length}`));
    };

    if (q.requestId) filter('request_id = $?', q.requestId);
    if (q.service) filter('service = $?', q.service);
    if (q.event) filter('event = $?', q.event);
    if (q.userId) filter('user_id = $?', q.userId);
    if (q.level) filter('level = $?', q.level);
    if (q.status !== undefined) filter('status = $?', q.status);
    if (q.from) filter('ts >= $?', q.from);
    if (q.to) filter('ts <= $?', q.to);

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // One query, so the total and the rows come from the same snapshot. As two statements, a line
    // inserted between them could be returned while the total still said zero, and a purge running
    // between them produced the opposite — pagination that did not describe its own page
    // (PR #129 review). count(*) OVER () counts the filtered set before LIMIT.
    //
    // Newest first, with line_id breaking ties so a page boundary is stable when two lines share a
    // timestamp — which they do, because one request writes several lines in the same millisecond.
    const page = await this.pool.query(
      `SELECT line_id, ts, received_at, service, level, event, request_id, user_id, role,
              method, path, status, duration_ms, extra, count(*) OVER () AS total
         FROM log_lines ${clause}
        ORDER BY ts DESC, line_id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, q.pageSize, (q.page - 1) * q.pageSize],
    );

    // An empty page is either "nothing matched" or "you asked for page 9 of 3", and the window
    // function cannot tell them apart: with no rows there is no row to carry the count. Reporting
    // zero for both made the total depend on which page you asked for, so a client could not tell
    // whether to navigate back (PR #129 review). Supplier keeps the filtered total for an empty
    // page - locations.service.int.spec.ts:173 - and this now matches it. The extra statement runs
    // only on an empty page, so the ordinary path is still one query and one snapshot.
    const total = page.rows.length
      ? Number(page.rows[0].total)
      : Number((await this.pool.query(`SELECT count(*) AS total FROM log_lines ${clause}`, params)).rows[0].total);

    return {
      lines: page.rows.map((row) => ({
        lineId: row.line_id,
        ts: new Date(row.ts).toISOString(),
        receivedAt: new Date(row.received_at).toISOString(),
        service: row.service,
        level: row.level,
        event: row.event,
        requestId: row.request_id,
        userId: row.user_id,
        role: row.role,
        method: row.method,
        path: row.path,
        status: row.status,
        durationMs: row.duration_ms,
        extra: row.extra,
      })),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }

  /**
   * Deletes lines older than the retention window, measured by **arrival** rather than by the
   * producer's `ts`. A producer with a fast clock, or any line carrying a future timestamp, would
   * otherwise keep its user id and path for thirty days *after that future date* — a line dated a
   * year ahead would sit here for thirteen months, which is not the retention this service
   * promises (PR #129 review). `received_at` is written by this database and cannot be influenced
   * by a producer.
   */
  async purge(retentionDays: number): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM log_lines WHERE received_at < now() - ($1 || ' days')::interval`,
      [String(retentionDays)],
    );
    return result.rowCount ?? 0;
  }
}
