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
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-28
 * Scope: Filter inside both subqueries instead of in one CTE they share, so a broad page stops
 *        materialising every matching row (PR #129 review).
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

    // One statement, so the rows and the total describe the same snapshot. Two statements let a
    // line inserted between them be returned while the total still said zero, and a purge between
    // them produced the opposite - pagination that did not describe its own page (PR #129 review).
    //
    // The shape is a count CTE LEFT JOINed to the page CTE, rather than count(*) OVER (): the
    // window function rides on the returned rows, so an empty page carried no total at all. A
    // fallback count fixed the number but reintroduced the second statement, which is the bug
    // above. Joining from the one-row total means an empty page still comes back as exactly one
    // row - with the total, and with line_id NULL to say there are no lines (PR #129 review).
    //
    // The predicate is repeated into both subqueries rather than put in one `filtered` CTE they
    // both read. PostgreSQL materialises a CTE referenced more than once, so the shared version
    // built every matching row - `extra` JSONB included - sorted the lot and then returned fifty of
    // them; on an unfiltered page, which is how the admin screen opens, that is the whole table.
    // Each subquery reads `log_lines` once now, so the count can go index-only and the page can
    // stop early on ix_log_lines_ts. Both still see one snapshot, because a snapshot belongs to the
    // statement and not to the scan - which is the only thing the single statement was for
    // (PR #129 review).
    //
    // Newest first, with line_id breaking ties so a page boundary is stable when two lines share a
    // timestamp - which they do, because one request writes several lines in the same millisecond.
    const page = await this.pool.query(
      `WITH total AS (SELECT count(*) AS total FROM log_lines ${clause}),
            page AS (
              SELECT line_id, ts, received_at, service, level, event, request_id, user_id, role,
                     method, path, status, duration_ms, extra
                FROM log_lines ${clause}
               ORDER BY ts DESC, line_id DESC
               LIMIT $${params.length + 1} OFFSET $${params.length + 2}
            )
       SELECT t.total, p.*
         FROM total t LEFT JOIN page p ON true
        ORDER BY p.ts DESC, p.line_id DESC`,
      [...params, q.pageSize, (q.page - 1) * q.pageSize],
    );

    // The LEFT JOIN always returns at least one row. When the page is empty that row is the total
    // with every line column NULL, so it is not a line and must not be read as one.
    const rows = page.rows.filter((row) => row.line_id !== null);
    const total = Number(page.rows[0].total);

    return {
      lines: rows.map((row) => ({
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
