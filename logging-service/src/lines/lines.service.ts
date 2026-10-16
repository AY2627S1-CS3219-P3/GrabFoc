/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated the insert, query and purge SQL, following the parameterised-query style of
 *        supplier-service/src/locations/locations.service.ts.
 * Author review: pending — Cole Lin to record what he checked.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../db/database';
import { LineRow, LogQuery } from './line.schema';

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
    const counted = await this.pool.query<{ total: string }>(
      `SELECT count(*) AS total FROM log_lines ${clause}`,
      params,
    );

    // Newest first, with line_id breaking ties so a page boundary is stable when two lines share
    // a timestamp — which they do, because one request writes several lines in the same
    // millisecond.
    const page = await this.pool.query(
      `SELECT line_id, ts, received_at, service, level, event, request_id, user_id, role,
              method, path, status, duration_ms, extra
         FROM log_lines ${clause}
        ORDER BY ts DESC, line_id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, q.pageSize, (q.page - 1) * q.pageSize],
    );

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
      total: Number(counted.rows[0].total),
    };
  }

  /** Deletes lines older than the retention window. Returns how many went. */
  async purge(retentionDays: number): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM log_lines WHERE ts < now() - ($1 || ' days')::interval`,
      [String(retentionDays)],
    );
    return result.rowCount ?? 0;
  }
}
