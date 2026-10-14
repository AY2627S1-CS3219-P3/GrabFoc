/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated parameterized read queries and row mapping for orders and order_history (Phase A).
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
 */
import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../db/database.module';
import type { HistoryEntry, Order, Page, PageQuery } from './orders.schemas';

/** Fixed WHERE clauses; `$1` is always the caller's ID. Never built from request input. */
const LISTS = {
  available: `status = 'PENDING' AND window_end > now() AND requester_id <> $1`,
  requester: `requester_id = $1`,
  courier: `courier_id = $1`,
} as const;
export type OrderList = keyof typeof LISTS;

type Row = Record<string, any>;

function toOrder(row: Row): Order {
  return {
    id: row.id,
    orderDescription: row.order_description,
    requesterId: row.requester_id,
    courierId: row.courier_id,
    pickupLocationId: row.pickup_location_id,
    pickupName: row.pickup_name,
    // NUMERIC arrives as a string; 9 decimal places fit a JS number.
    pickupLat: Number(row.pickup_lat),
    pickupLon: Number(row.pickup_lon),
    deliveryLocationId: row.delivery_location_id,
    deliveryName: row.delivery_name,
    deliveryLat: Number(row.delivery_lat),
    deliveryLon: Number(row.delivery_lon),
    creditOffer: row.credit_offer,
    status: row.status,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

function toHistory(row: Row): HistoryEntry {
  return {
    id: row.id,
    actorId: row.actor_id,
    action: row.action,
    previousStatus: row.previous_status,
    newStatus: row.new_status,
    changeDetails: row.change_details,
    occurredAt: row.occurred_at,
  };
}

@Injectable()
export class OrdersRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findById(id: string): Promise<Order | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM orders WHERE id = $1', [id]);
    return rows[0] && toOrder(rows[0]);
  }

  /** Newest first; `id` breaks ties so pages never overlap. */
  async list(list: OrderList, userId: string, { page, pageSize }: PageQuery): Promise<Page<Order>> {
    const where = LISTS[list];
    const [items, count] = await Promise.all([
      this.pool.query(`SELECT * FROM orders WHERE ${where} ORDER BY created_at DESC, id LIMIT $2 OFFSET $3`, [
        userId,
        pageSize,
        (page - 1) * pageSize,
      ]),
      this.pool.query<{ n: string }>(`SELECT count(*) AS n FROM orders WHERE ${where}`, [userId]),
    ]);
    return { items: items.rows.map(toOrder), page, pageSize, total: Number(count.rows[0].n) };
  }

  /** Oldest first, so the entries read as a timeline. */
  async history(orderId: string): Promise<HistoryEntry[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM order_history WHERE order_id = $1 ORDER BY occurred_at, id',
      [orderId],
    );
    return rows.map(toHistory);
  }
}
