/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated parameterized read queries and row mapping for orders and order_history (Phase A).
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Added the transaction helper, insert, guarded update/accept/status changes, history
 *        writes and the credit clean-up queries (Phase B).
 * Author review: Reviewed in full.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Added row locking, guarded lifecycle transitions, window changes and the
 *        order_confirmations queries (Phase C).
 * Author review: Reviewed
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-17
 * Scope: The settlement queries now cover COMPLETED orders too, using credit_settled_at (Phase D).
 * Author review: Reviewed
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Added the expiry worker's queries and let pending proposals resolve as EXPIRED (Phase D).
 * Author review: Reviewed
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Added the order.events outbox queries and the active-order lookup (Phase D).
 * Author review: Reviewed
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-21
 * Scope: Added the suspended user's unfinished-order queries and cancelReason (Phase D).
 * Author review: Tested by Zi Yi (unit and compose.test.yaml integration tests), 2026-10-21.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../db/database.module';
import type {
  Confirmation,
  ConfirmationKind,
  HistoryEntry,
  Order,
  OrderStatus,
  Page,
  PageQuery,
} from './orders.schemas';

/** Fixed WHERE clauses; `$1` is always the caller's ID. Never built from request input. */
const LISTS = {
  available: `status = 'PENDING' AND window_end > now() AND requester_id <> $1`,
  requester: `requester_id = $1`,
  courier: `courier_id = $1`,
} as const;
export type OrderList = keyof typeof LISTS;

/** States an order has not finished in; a suspension cancels all of them, AWAITING_CREDIT included. */
const UNFINISHED = `status NOT IN ('COMPLETED','CANCELLED')`;

/** States the expiry worker cancels once window_end has passed. */
const EXPIRABLE = `'PENDING','ACCEPTED','PICKED_UP','IN_PROGRESS'`;

type Row = Record<string, any>;
type Db = Pool | PoolClient;

/** A history entry waiting for order.events, with the order's participants. */
export interface Unpublished {
  id: string;
  orderId: string;
  requesterId: string;
  courierId: string | null;
  action: 'ACCEPTED' | 'PICKED_UP' | 'IN_PROGRESS' | 'ARRIVED' | 'COMPLETED' | 'CANCELLED';
  newStatus: OrderStatus;
  changeDetails: { reason?: string } | null;
  occurredAt: Date;
}

export interface Unsettled {
  id: string;
  status: 'CANCELLED' | 'COMPLETED';
  courierId: string | null;
}

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

export type Side = 'requester' | 'courier';
const RESPONSE_COLUMNS = { requester: 'requester_response', courier: 'courier_response' } as const;

export interface NewConfirmation {
  kind: ConfirmationKind;
  proposedBy: string;
  proposerSide: Side;
  windowStart?: Date;
  windowEnd?: Date;
}

function toConfirmation(row: Row): Confirmation {
  return {
    id: row.id,
    kind: row.kind,
    proposedBy: row.proposed_by,
    proposedWindowStart: row.proposed_window_start,
    proposedWindowEnd: row.proposed_window_end,
    requesterResponse: row.requester_response,
    courierResponse: row.courier_response,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
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

  /** Locks the order row until the transaction ends, so confirmation changes on it run one at a time. */
  async lock(tx: PoolClient, id: string): Promise<Order | undefined> {
    const { rows } = await tx.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id]);
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

  /**
   * Moves the order `from` → `to` only at the expected version and, with `unexpired`, before
   * window_end; undefined otherwise.
   */
  async transition(
    tx: PoolClient,
    id: string,
    version: number,
    from: OrderStatus,
    to: OrderStatus,
    unexpired: boolean,
  ): Promise<Order | undefined> {
    const { rows } = await tx.query(
      `UPDATE orders SET status = $4, version = version + 1, updated_at = now()
       WHERE id = $1 AND version = $2 AND status = $3 ${unexpired ? 'AND window_end > now()' : ''} RETURNING *`,
      [id, version, from, to],
    );
    return rows[0] && toOrder(rows[0]);
  }

  /** For an approved timing change; the caller holds the row lock and has rechecked the order. */
  async setWindow(tx: PoolClient, id: string, windowStart: Date, windowEnd: Date): Promise<Order> {
    const { rows } = await tx.query(
      `UPDATE orders SET window_start = $2, window_end = $3, version = version + 1, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, windowStart, windowEnd],
    );
    return toOrder(rows[0]);
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

  /** Orders whose window has ended in a state that times out; ARRIVED never does. Rest next run. */
  async expired(): Promise<string[]> {
    const { rows } = await this.pool.query(
      `SELECT id FROM orders WHERE status IN (${EXPIRABLE}) AND window_end <= now() ORDER BY window_end LIMIT 100`,
    );
    return rows.map((row) => row.id);
  }

  /**
   * Locks the order only if it is still expired. A concurrent change is waited for and the
   * condition rechecked against the new row, so an order that moved on is skipped.
   */
  async lockExpired(tx: PoolClient, id: string): Promise<Order | undefined> {
    const { rows } = await tx.query(
      `SELECT * FROM orders WHERE id = $1 AND status IN (${EXPIRABLE}) AND window_end <= now() FOR UPDATE`,
      [id],
    );
    return rows[0] && toOrder(rows[0]);
  }

  /** Finished orders whose transfer or release command Kafka has not yet stored: the outbox. */
  async unsettled(): Promise<Unsettled[]> {
    const { rows } = await this.pool.query(
      `SELECT id, status, courier_id FROM orders
       WHERE status IN ('CANCELLED','COMPLETED') AND credit_settled_at IS NULL ORDER BY updated_at LIMIT 100`,
    );
    return rows.map((row) => ({ id: row.id, status: row.status, courierId: row.courier_id }));
  }

  async markCreditSettled(id: string, db: Db = this.pool): Promise<void> {
    await db.query('UPDATE orders SET credit_settled_at = now() WHERE id = $1', [id]);
  }

  /**
   * History entries not yet on order.events, oldest first so each order's events go out in order.
   * The WHERE clause matches order_history_unpublished_idx.
   */
  async unpublished(): Promise<Unpublished[]> {
    const { rows } = await this.pool.query(
      `SELECT h.id, h.order_id, o.requester_id, o.courier_id, h.action, h.new_status, h.change_details, h.occurred_at
       FROM order_history h JOIN orders o ON o.id = h.order_id
       WHERE h.published_at IS NULL
         AND h.action IN ('ACCEPTED','PICKED_UP','IN_PROGRESS','ARRIVED','COMPLETED','CANCELLED')
         AND h.previous_status <> 'AWAITING_CREDIT'
       ORDER BY h.occurred_at, h.id LIMIT 100`,
    );
    return rows.map((row) => ({
      id: row.id,
      orderId: row.order_id,
      requesterId: row.requester_id,
      courierId: row.courier_id,
      action: row.action,
      newStatus: row.new_status,
      changeDetails: row.change_details,
      occurredAt: row.occurred_at,
    }));
  }

  async markPublished(historyId: string): Promise<void> {
    await this.pool.query('UPDATE order_history SET published_at = now() WHERE id = $1', [historyId]);
  }

  /** True if the user is requester or courier on any order that has not finished. */
  async hasActiveOrders(userId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `SELECT EXISTS (SELECT 1 FROM orders WHERE (requester_id = $1 OR courier_id = $1) AND ${UNFINISHED}) AS active`,
      [userId],
    );
    return rows[0].active;
  }

  /** Unfinished orders the user is requester or courier on. */
  async unfinishedOrderIds(userId: string): Promise<string[]> {
    const { rows } = await this.pool.query(
      `SELECT id FROM orders WHERE (requester_id = $1 OR courier_id = $1) AND ${UNFINISHED}`,
      [userId],
    );
    return rows.map((row) => row.id);
  }

  /** Locks the order only if it is still unfinished; like lockExpired, rechecked after any wait. */
  async lockUnfinished(tx: PoolClient, id: string): Promise<Order | undefined> {
    const { rows } = await tx.query(`SELECT * FROM orders WHERE id = $1 AND ${UNFINISHED} FOR UPDATE`, [id]);
    return rows[0] && toOrder(rows[0]);
  }

  /** The reason recorded when the order was cancelled, if it was. */
  async cancelReason(id: string): Promise<string | undefined> {
    const { rows } = await this.pool.query(
      `SELECT change_details->>'reason' AS reason FROM order_history
       WHERE order_id = $1 AND action = 'CANCELLED' ORDER BY occurred_at DESC LIMIT 1`,
      [id],
    );
    return rows[0]?.reason ?? undefined;
  }

  /** Oldest first, like history. */
  async confirmations(orderId: string): Promise<Confirmation[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM order_confirmations WHERE order_id = $1 ORDER BY created_at, id',
      [orderId],
    );
    return rows.map(toConfirmation);
  }

  /**
   * The proposer's own response starts ACCEPTED, the other side's PENDING. The partial unique
   * index rejects a second PENDING proposal on the order (23505).
   */
  async propose(tx: PoolClient, orderId: string, c: NewConfirmation): Promise<Confirmation> {
    const own = (side: Side) => (side === c.proposerSide ? 'ACCEPTED' : 'PENDING');
    const { rows } = await tx.query(
      `INSERT INTO order_confirmations
         (order_id, kind, proposed_by, proposed_window_start, proposed_window_end, requester_response, courier_response)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [orderId, c.kind, c.proposedBy, c.windowStart ?? null, c.windowEnd ?? null, own('requester'), own('courier')],
    );
    return toConfirmation(rows[0]);
  }

  async lockConfirmation(tx: PoolClient, orderId: string, id: string): Promise<Confirmation | undefined> {
    const { rows } = await tx.query(
      'SELECT * FROM order_confirmations WHERE id = $1 AND order_id = $2 FOR UPDATE',
      [id, orderId],
    );
    return rows[0] && toConfirmation(rows[0]);
  }

  /** Resolves a proposal, first recording the responder's answer when given. */
  async resolve(
    tx: PoolClient,
    id: string,
    status: Exclude<Confirmation['status'], 'PENDING'>,
    response?: { side: Side; value: 'ACCEPTED' | 'REJECTED' },
  ): Promise<Confirmation> {
    const set = response ? `${RESPONSE_COLUMNS[response.side]} = $3, ` : '';
    const { rows } = await tx.query(
      `UPDATE order_confirmations SET ${set}status = $2, resolved_at = now() WHERE id = $1 RETURNING *`,
      response ? [id, status, response.value] : [id, status],
    );
    return toConfirmation(rows[0]);
  }

  /** Pending proposals of these kinds that an order change has made moot (or, for timing, expired). */
  async supersedePending(
    tx: PoolClient,
    orderId: string,
    kinds: ConfirmationKind[],
    status: 'SUPERSEDED' | 'EXPIRED' = 'SUPERSEDED',
  ): Promise<void> {
    await tx.query(
      `UPDATE order_confirmations SET status = $3, resolved_at = now()
       WHERE order_id = $1 AND status = 'PENDING' AND kind = ANY($2)`,
      [orderId, kinds, status],
    );
  }

  async addHistory(tx: PoolClient, entry: NewHistory): Promise<void> {
    await tx.query(
      `INSERT INTO order_history (order_id, actor_id, action, previous_status, new_status, change_details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [entry.orderId, entry.actorId, entry.action, entry.previousStatus, entry.newStatus, entry.changeDetails ?? null],
    );
  }
}
