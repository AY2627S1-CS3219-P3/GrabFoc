/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
 * Scope: Implemented reserve, transfer and release from Jian Bing's confirmed design: one hold
 *        per order (unique order id, state RESERVED -> TRANSFERRED | RELEASED), duplicates return
 *        the original result, mismatches are rejected, and the balance is changed with a
 *        conditional update in the same transaction as the hold.
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Added error codes; added getBalance (Task 3).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { ErrorCode } from '../common/error-codes';
import { ProblemException } from '../common/problem';
import { PG_POOL } from '../db/database';
import type { ReleaseRequest, ReserveRequest, TransferRequest } from './credit.schemas';

export type HoldState = 'RESERVED' | 'TRANSFERRED' | 'RELEASED';

export interface Hold {
  orderId: string;
  requesterId: string;
  courierId: string | null;
  amount: number;
  state: HoldState;
}

/** `created` is false when the request repeated one already applied, so nothing changed. */
export interface HoldResult {
  hold: Hold;
  created: boolean;
}

interface HoldRow {
  order_id: string;
  requester_id: string;
  courier_id: string | null;
  amount: number;
  state: HoldState;
}

const HOLD_COLUMNS = 'order_id, requester_id, courier_id, amount, state';

function toHold(row: HoldRow): Hold {
  return {
    orderId: row.order_id,
    requesterId: row.requester_id,
    courierId: row.courier_id,
    amount: row.amount,
    state: row.state,
  };
}

/** Creates the user's account with the starting credits if it doesn't exist yet (team rule). */
async function ensureAccount(client: PoolClient, userId: string): Promise<void> {
  await client.query('INSERT INTO credit_accounts (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
}

async function findHold(client: PoolClient, orderId: string): Promise<Hold | undefined> {
  const { rows } = await client.query<HoldRow>(`SELECT ${HOLD_COLUMNS} FROM credit_holds WHERE order_id = $1`, [
    orderId,
  ]);
  return rows[0] && toHold(rows[0]);
}

@Injectable()
export class CreditsService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Runs `work` in one transaction: every change commits together or none does (NFR1.4). */
  private async inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Moves `amount` from the requester's available to reserved credits for a new order (CSFR2). */
  reserve({ orderId, requesterId, amount }: ReserveRequest): Promise<HoldResult> {
    return this.inTransaction(async (client) => {
      await ensureAccount(client, requesterId);

      // The unique order id makes a second insert for the same order do nothing. A concurrent
      // duplicate waits here until the first transaction commits or rolls back.
      const inserted = await client.query<HoldRow>(
        `INSERT INTO credit_holds (order_id, requester_id, amount) VALUES ($1, $2, $3)
         ON CONFLICT (order_id) DO NOTHING RETURNING ${HOLD_COLUMNS}`,
        [orderId, requesterId, amount],
      );

      if (inserted.rowCount === 0) {
        const existing = (await findHold(client, orderId))!;
        if (existing.requesterId !== requesterId || existing.amount !== amount) {
          throw new ProblemException(
            409,
            `Order ${orderId} already has credits reserved with a different requester or amount.`,
            ErrorCode.HOLD_MISMATCH,
          );
        }
        return { hold: existing, created: false };
      }

      // The check and the change are one statement, so two orders at once can't overdraw (NFR2.1.1).
      const debited = await client.query(
        `UPDATE credit_accounts
            SET available = available - $2, reserved = reserved + $2, updated_at = now()
          WHERE user_id = $1 AND available >= $2`,
        [requesterId, amount],
      );
      if (debited.rowCount === 0) {
        // Throwing rolls back the hold inserted above.
        throw new ProblemException(409, 'Insufficient credits to reserve this amount.', ErrorCode.INSUFFICIENT_CREDITS);
      }

      return { hold: toHold(inserted.rows[0]), created: true };
    });
  }

  /** Pays a completed order's reserved credits to its courier (CSFR3). */
  transfer({ orderId, courierId }: TransferRequest): Promise<HoldResult> {
    return this.inTransaction(async (client) => {
      await ensureAccount(client, courierId);

      // Only a RESERVED hold moves on. A concurrent transfer or release waits for this row's lock,
      // then finds the state changed and updates nothing.
      const moved = await client.query<HoldRow>(
        `UPDATE credit_holds SET state = 'TRANSFERRED', courier_id = $2, updated_at = now()
          WHERE order_id = $1 AND state = 'RESERVED' AND requester_id <> $2
          RETURNING ${HOLD_COLUMNS}`,
        [orderId, courierId],
      );

      if (moved.rowCount === 0) {
        const existing = await findHold(client, orderId);
        if (!existing) {
          throw new ProblemException(404, `No credits are reserved for order ${orderId}.`, ErrorCode.HOLD_NOT_FOUND);
        }
        if (existing.state === 'TRANSFERRED' && existing.courierId === courierId) {
          return { hold: existing, created: false };
        }
        if (existing.state === 'RESERVED') {
          throw new ProblemException(409, 'The courier cannot be the order’s requester.', ErrorCode.COURIER_IS_REQUESTER);
        }
        if (existing.state === 'RELEASED') {
          throw new ProblemException(
            409,
            `Order ${orderId}'s credits were already released to the requester.`,
            ErrorCode.ALREADY_RELEASED,
          );
        }
        throw new ProblemException(
          409,
          `Order ${orderId}'s credits were already transferred to a different courier.`,
          ErrorCode.ALREADY_TRANSFERRED,
        );
      }

      const hold = toHold(moved.rows[0]);
      // Change the two accounts in a fixed order (by user id), so two transfers between the same
      // pair of users in opposite directions can't deadlock.
      const changes = [
        {
          userId: hold.requesterId,
          sql: 'UPDATE credit_accounts SET reserved = reserved - $2, updated_at = now() WHERE user_id = $1',
        },
        {
          userId: hold.courierId!,
          sql: 'UPDATE credit_accounts SET available = available + $2, updated_at = now() WHERE user_id = $1',
        },
      ].sort((a, b) => (a.userId < b.userId ? -1 : 1));
      for (const change of changes) {
        await client.query(change.sql, [change.userId, hold.amount]);
      }

      return { hold, created: true };
    });
  }

  /** Returns a cancelled order's reserved credits to the requester's available balance (CSFR4). */
  release({ orderId }: ReleaseRequest): Promise<HoldResult> {
    return this.inTransaction(async (client) => {
      const moved = await client.query<HoldRow>(
        `UPDATE credit_holds SET state = 'RELEASED', updated_at = now()
          WHERE order_id = $1 AND state = 'RESERVED'
          RETURNING ${HOLD_COLUMNS}`,
        [orderId],
      );

      if (moved.rowCount === 0) {
        const existing = await findHold(client, orderId);
        if (!existing) {
          throw new ProblemException(404, `No credits are reserved for order ${orderId}.`, ErrorCode.HOLD_NOT_FOUND);
        }
        if (existing.state === 'RELEASED') return { hold: existing, created: false };
        throw new ProblemException(
          409,
          `Order ${orderId}'s credits were already transferred to its courier.`,
          ErrorCode.ALREADY_TRANSFERRED,
        );
      }

      const hold = toHold(moved.rows[0]);
      await client.query(
        `UPDATE credit_accounts
            SET available = available + $2, reserved = reserved - $2, updated_at = now()
          WHERE user_id = $1`,
        [hold.requesterId, hold.amount],
      );
      return { hold, created: true };
    });
  }
}
