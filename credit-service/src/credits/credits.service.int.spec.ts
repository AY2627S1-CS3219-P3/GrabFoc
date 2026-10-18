/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
 * Scope: Generated integration tests for CreditsService against a real PostgreSQL: reserve,
 *        transfer and release, duplicates, mismatches, and concurrent requests.
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Added the createWallet tests (Kafka plan Task 3).
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
 */
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { ProblemException } from '../common/problem';
import { emptyTables, openTestDatabase } from '../test/database';
import { CreditsService } from './credits.service';

let pool: Pool;
let service: CreditsService;

beforeAll(async () => {
  pool = await openTestDatabase();
  service = new CreditsService(pool);
});
afterAll(() => pool.end());
beforeEach(() => emptyTables(pool));

/** A user's balances, straight from the database. */
async function balance(userId: string): Promise<{ available: number; reserved: number } | undefined> {
  const { rows } = await pool.query('SELECT available, reserved FROM credit_accounts WHERE user_id = $1', [userId]);
  return rows[0];
}

/** Awaits `promise` and returns the HTTP status of the ProblemException it rejects with. */
async function statusOf(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ProblemException) return err.getStatus();
    throw err;
  }
  throw new Error('expected the call to fail');
}

const requester = randomUUID();
const courier = randomUUID();

describe('reserve', () => {
  it('creates the account with 10 credits and moves the amount to reserved', async () => {
    const orderId = randomUUID();
    const result = await service.reserve({ orderId, requesterId: requester, amount: 3 });

    expect(result).toEqual({
      created: true,
      hold: { orderId, requesterId: requester, courierId: null, amount: 3, state: 'RESERVED' },
    });
    expect(await balance(requester)).toEqual({ available: 7, reserved: 3 });
  });

  it('applies a repeated request once and returns the original hold', async () => {
    const orderId = randomUUID();
    const first = await service.reserve({ orderId, requesterId: requester, amount: 3 });
    const again = await service.reserve({ orderId, requesterId: requester, amount: 3 });

    expect(again).toEqual({ created: false, hold: first.hold });
    expect(await balance(requester)).toEqual({ available: 7, reserved: 3 });
  });

  it('rejects a repeat with a different amount or requester, changing nothing', async () => {
    const orderId = randomUUID();
    await service.reserve({ orderId, requesterId: requester, amount: 3 });

    expect(await statusOf(service.reserve({ orderId, requesterId: requester, amount: 5 }))).toBe(409);
    expect(await statusOf(service.reserve({ orderId, requesterId: randomUUID(), amount: 3 }))).toBe(409);
    expect(await balance(requester)).toEqual({ available: 7, reserved: 3 });
  });

  it('rejects insufficient credits and leaves no hold behind', async () => {
    const orderId = randomUUID();
    expect(await statusOf(service.reserve({ orderId, requesterId: requester, amount: 11 }))).toBe(409);

    const { rowCount } = await pool.query('SELECT 1 FROM credit_holds WHERE order_id = $1', [orderId]);
    expect(rowCount).toBe(0);
    // The account creation rolled back too; the next request creates it again with 10.
    expect(await balance(requester)).toBeUndefined();
  });

  it('allows reserving exactly the whole available balance', async () => {
    await service.reserve({ orderId: randomUUID(), requesterId: requester, amount: 10 });
    expect(await balance(requester)).toEqual({ available: 0, reserved: 10 });
  });

  it('applies ten identical requests sent at once exactly once', async () => {
    const orderId = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => service.reserve({ orderId, requesterId: requester, amount: 3 })),
    );

    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await balance(requester)).toEqual({ available: 7, reserved: 3 });
  });

  it('never overdraws when different orders reserve at once', async () => {
    // 10 credits, five orders of 3 at the same moment: only three can fit.
    const settled = await Promise.allSettled(
      Array.from({ length: 5 }, () => service.reserve({ orderId: randomUUID(), requesterId: requester, amount: 3 })),
    );

    const succeeded = settled.filter((s) => s.status === 'fulfilled');
    const failed = settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected');
    expect(succeeded).toHaveLength(3);
    expect(failed.map((f) => (f.reason as ProblemException).getStatus())).toEqual([409, 409]);
    expect(await balance(requester)).toEqual({ available: 1, reserved: 9 });
  });
});

describe('transfer', () => {
  it("moves the reserved credits to the courier's available balance", async () => {
    const orderId = randomUUID();
    await service.reserve({ orderId, requesterId: requester, amount: 3 });
    const result = await service.transfer({ orderId, courierId: courier });

    expect(result).toEqual({
      created: true,
      hold: { orderId, requesterId: requester, courierId: courier, amount: 3, state: 'TRANSFERRED' },
    });
    expect(await balance(requester)).toEqual({ available: 7, reserved: 0 });
    expect(await balance(courier)).toEqual({ available: 13, reserved: 0 });
  });

  it('treats a repeat to the same courier as done, and rejects a different courier', async () => {
    const orderId = randomUUID();
    await service.reserve({ orderId, requesterId: requester, amount: 3 });
    await service.transfer({ orderId, courierId: courier });

    expect((await service.transfer({ orderId, courierId: courier })).created).toBe(false);
    expect(await statusOf(service.transfer({ orderId, courierId: randomUUID() }))).toBe(409);
    expect(await balance(courier)).toEqual({ available: 13, reserved: 0 });
  });

  it('rejects paying the requester themselves, an unknown order, and a released order', async () => {
    const orderId = randomUUID();
    await service.reserve({ orderId, requesterId: requester, amount: 3 });
    expect(await statusOf(service.transfer({ orderId, courierId: requester }))).toBe(409);
    expect(await statusOf(service.transfer({ orderId: randomUUID(), courierId: courier }))).toBe(404);

    await service.release({ orderId });
    expect(await statusOf(service.transfer({ orderId, courierId: courier }))).toBe(409);
    expect(await balance(requester)).toEqual({ available: 10, reserved: 0 });
  });
});

describe('release', () => {
  it("returns the reserved credits to the requester's available balance", async () => {
    const orderId = randomUUID();
    await service.reserve({ orderId, requesterId: requester, amount: 3 });
    const result = await service.release({ orderId });

    expect(result.created).toBe(true);
    expect(result.hold.state).toBe('RELEASED');
    expect(await balance(requester)).toEqual({ available: 10, reserved: 0 });
  });

  it('treats a repeated release as done', async () => {
    const orderId = randomUUID();
    await service.reserve({ orderId, requesterId: requester, amount: 3 });
    await service.release({ orderId });

    expect((await service.release({ orderId })).created).toBe(false);
    expect(await balance(requester)).toEqual({ available: 10, reserved: 0 });
  });

  it('rejects an unknown order and an order already transferred', async () => {
    expect(await statusOf(service.release({ orderId: randomUUID() }))).toBe(404);

    const orderId = randomUUID();
    await service.reserve({ orderId, requesterId: requester, amount: 3 });
    await service.transfer({ orderId, courierId: courier });
    expect(await statusOf(service.release({ orderId }))).toBe(409);
  });
});

describe('transfer and release racing on one order', () => {
  it('lets exactly one win and keeps the total number of credits', async () => {
    for (let round = 0; round < 10; round++) {
      await emptyTables(pool);
      const orderId = randomUUID();
      await service.reserve({ orderId, requesterId: requester, amount: 3 });

      const settled = await Promise.allSettled([
        service.transfer({ orderId, courierId: courier }),
        service.release({ orderId }),
      ]);

      expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
      const r = (await balance(requester))!;
      const c = (await balance(courier)) ?? { available: 0, reserved: 0 };
      expect(r.reserved).toBe(0);
      // Requester 10 + courier 10 (if created) before; no credit created or lost.
      const courierStart = (await balance(courier)) ? 10 : 0;
      expect(r.available + c.available).toBe(10 + courierStart);
    }
  });
});

describe('error codes', () => {
  async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
    try {
      await promise;
    } catch (err) {
      if (err instanceof ProblemException) return err.code;
      throw err;
    }
    throw new Error('expected the call to fail');
  }

  it('labels every reserve, transfer and release failure', async () => {
    const reserved = randomUUID();
    await service.reserve({ orderId: reserved, requesterId: requester, amount: 3 });
    expect(await codeOf(service.reserve({ orderId: randomUUID(), requesterId: requester, amount: 99 }))).toBe(
      'INSUFFICIENT_CREDITS',
    );
    expect(await codeOf(service.reserve({ orderId: reserved, requesterId: requester, amount: 4 }))).toBe('HOLD_MISMATCH');
    expect(await codeOf(service.transfer({ orderId: reserved, courierId: requester }))).toBe('COURIER_IS_REQUESTER');
    expect(await codeOf(service.transfer({ orderId: randomUUID(), courierId: courier }))).toBe('HOLD_NOT_FOUND');
    expect(await codeOf(service.release({ orderId: randomUUID() }))).toBe('HOLD_NOT_FOUND');

    const paid = randomUUID();
    await service.reserve({ orderId: paid, requesterId: requester, amount: 1 });
    await service.transfer({ orderId: paid, courierId: courier });
    expect(await codeOf(service.transfer({ orderId: paid, courierId: randomUUID() }))).toBe('ALREADY_TRANSFERRED');
    expect(await codeOf(service.release({ orderId: paid }))).toBe('ALREADY_TRANSFERRED');

    const refunded = randomUUID();
    await service.reserve({ orderId: refunded, requesterId: requester, amount: 1 });
    await service.release({ orderId: refunded });
    expect(await codeOf(service.transfer({ orderId: refunded, courierId: courier }))).toBe('ALREADY_RELEASED');
  });
});

describe('createWallet', () => {
  it('creates a wallet with 10 credits', async () => {
    const userId = randomUUID();
    expect(await service.createWallet(userId)).toBe(true);
    expect(await balance(userId)).toEqual({ available: 10, reserved: 0 });
  });

  it('does nothing for a repeated event, so credits are never granted twice', async () => {
    const userId = randomUUID();
    await service.createWallet(userId);
    await pool.query('UPDATE credit_accounts SET available = 4 WHERE user_id = $1', [userId]);
    expect(await service.createWallet(userId)).toBe(false);
    expect(await balance(userId)).toEqual({ available: 4, reserved: 0 });
  });
});
