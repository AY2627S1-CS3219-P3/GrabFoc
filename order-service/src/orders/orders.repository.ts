/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated parameterized read queries and row mapping for orders and order_history (Phase A).
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Added the transaction helper, insert, guarded update/accept/status changes, history
 *        writes and the credit clean-up queries (Phase B).
 * Author review: Reviewed in full.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../db/database.module';
import type { HistoryEntry, Order, OrderStatus, Page, PageQuery } from './orders.schemas';

/** Fixed WHERE clauses; `$1` is always the caller's ID. Never built from request input. */
const LISTS = {
  available: `status = 'PENDING' AND window_end > now() AND requester_id <> $1`,
  requester: `requester_id = $1`,
  courier: `courier_id = $1`,
} as const;
export type OrderList = keyof typeof LISTS;

type Row = Record<string, any>;
type Db = Pool | PoolClient;

/** Order fields a requester may change, and their columns. */
const EDITABLE = {
  orderDescription: 'order_description',
  pickupLocationId: 'pickup_location_id',
  pickupName: 'pickup_name',
  pickupLat: 'pickup_lat',
  pickupLon: 'pickup_lon',
  deliveryLocationId: 'delivery_location_id',
  deliveryName: 'delivery_name',
  deliveryLat: 'delivery_lat',
  deliveryLon: 'delivery_lon',
  windowStart: 'window_start',
  windowEnd: 'window_end',
} as const;
export type OrderEdit = Partial<Pick<Order, keyof typeof EDITABLE>>;
export type NewOrder = Required<OrderEdit> & Pick<Order, 'requesterId' | 'creditOffer'>;
const INSERTABLE = { ...EDITABLE, requesterId: 'requester_id', creditOffer: 'credit_offer' } as const;

export interface NewHistory {
  orderId: string;
  actorId: string | null;
  action: string;
  previousStatus: OrderStatus | null;
  newStatus: OrderStatus | null;
  changeDetails?: unknown;
}

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

  /** Runs `fn` in one transaction on one client; rolls back if it throws. */
  async transaction<T>(fn: (tx: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async findById(id: string, db: Db = this.pool): Promise<Order | undefined> {
    const { rows } = await db.query('SELECT * FROM orders WHERE id = $1', [id]);
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

  /** New orders start AWAITING_CREDIT; couriers never see them until Credit confirms the hold. */
  async insert(tx: PoolClient, order: NewOrder): Promise<Order> {
    const names = Object.keys(order).map((key) => INSERTABLE[key as keyof NewOrder]);
    const { rows } = await tx.query(
      `INSERT INTO orders (status, ${names.join(', ')})
       VALUES ('AWAITING_CREDIT', ${names.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
      Object.values(order),
    );
    return toOrder(rows[0]);
  }

  /** Moves the order `from` → `to` only if it is still in `from`; undefined otherwise. */
  async setStatus(tx: PoolClient, id: string, from: OrderStatus, to: OrderStatus): Promise<Order | undefined> {
    const { rows } = await tx.query(
      `UPDATE orders SET status = $3, version = version + 1, updated_at = now()
       WHERE id = $1 AND status = $2 RETURNING *`,
      [id, from, to],
    );
    return rows[0] && toOrder(rows[0]);
  }

  /** Applies a requester edit only while PENDING at the expected version; undefined otherwise. */
  async update(tx: PoolClient, id: string, version: number, edit: OrderEdit): Promise<Order | undefined> {
    const keys = Object.keys(edit) as (keyof OrderEdit)[];
    const sets = keys.map((key, i) => `${EDITABLE[key]} = $${i + 3}`);
    const { rows } = await tx.query(
      `UPDATE orders SET ${sets.join(', ')}, version = version + 1, updated_at = now()
       WHERE id = $1 AND version = $2 AND status = 'PENDING' RETURNING *`,
      [id, version, ...keys.map((key) => edit[key])],
    );
    return rows[0] && toOrder(rows[0]);
  }

  /**
   * Assigns the courier only if the order is still open: PENDING, unassigned, unexpired, not the
   * courier's own, at the expected version. The partial unique index rejects a busy courier (23505).
   */
  async accept(tx: PoolClient, id: string, courierId: string, version: number): Promise<Order | undefined> {
    const { rows } = await tx.query(
      `UPDATE orders SET courier_id = $2, status = 'ACCEPTED', version = version + 1, updated_at = now()
       WHERE id = $1 AND version = $3 AND status = 'PENDING' AND courier_id IS NULL
         AND requester_id <> $2 AND window_end > now()
       RETURNING *`,
      [id, courierId, version],
    );
    return rows[0] && toOrder(rows[0]);
  }

  /** AWAITING_CREDIT orders older than any create request can take: their request died. */
  async staleAwaitingCredit(): Promise<string[]> {
    const { rows } = await this.pool.query(
      `SELECT id FROM orders WHERE status = 'AWAITING_CREDIT' AND created_at < now() - interval '30 seconds'`,
    );
    return rows.map((row) => row.id);
  }

  /** Cancelled orders whose credits Credit has not confirmed as released. */
  async unreleasedCancelled(): Promise<string[]> {
    const { rows } = await this.pool.query(
      `SELECT id FROM orders WHERE status = 'CANCELLED' AND credit_released_at IS NULL ORDER BY updated_at LIMIT 100`,
    );
    return rows.map((row) => row.id);
  }

  async markCreditReleased(id: string): Promise<void> {
    await this.pool.query('UPDATE orders SET credit_released_at = now() WHERE id = $1', [id]);
  }

  async addHistory(tx: PoolClient, entry: NewHistory): Promise<void> {
    await tx.query(
      `INSERT INTO order_history (order_id, actor_id, action, previous_status, new_status, change_details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [entry.orderId, entry.actorId, entry.action, entry.previousStatus, entry.newStatus, entry.changeDetails ?? null],
    );
  }
}
