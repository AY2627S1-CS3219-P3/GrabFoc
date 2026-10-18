/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated the participant authorization rules for the Phase A read endpoints.
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Added create (save AWAITING_CREDIT, reserve, open as PENDING, cancel and release on
 *        failure), the credit clean-up job, requester edit and courier accept rules (Phase B).
 * Author review: Reviewed in full
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Added the courier lifecycle steps and requester cancellation of PENDING orders (Phase C).
 * Author review: Reviewed
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-17
 * Scope: Renamed the clean-up job to settleCredits: it sends Credit's TransferCredits /
 *        ReleaseCredits commands for finished orders instead of HTTP release; insufficient
 *        credits sends nothing (Phase D).
 * Author review: Reviewed
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Added the expiry worker (expireOrders) that cancels orders whose window has ended (Phase D).
 * Author review: Reviewed
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Replaced the "no OrderCancelled event yet" note now that history feeds order.events.
 * Author review: Pending review by Zi Yi.
 */
import { Injectable, Logger } from '@nestjs/common';
import type { Caller } from '../common/jwt-auth.guard';
import { AppError, ErrorCode } from '../common/errors';
import { CreditClient } from '../integrations/credit.client';
import { CreditCommands } from '../integrations/credit.commands';
import { Location, SupplierClient } from '../integrations/supplier.client';
import { OrderEdit, OrderList, OrdersRepository, Unsettled } from './orders.repository';
import type { CreateOrderBody, EditOrderBody, HistoryEntry, Order, OrderStatus, Page, PageQuery } from './orders.schemas';
import { assertPickupOpen, assertValidWindow, defaultWindow } from './timing';

const isParticipant = (order: Order, caller: Caller) =>
  order.requesterId === caller.id || order.courierId === caller.id;

const isAvailable = (order: Order) => order.status === 'PENDING' && order.windowEnd > new Date();

const forbidden = (message = 'Only the requester or assigned courier can view this order.') =>
  new AppError(403, ErrorCode.FORBIDDEN, message);

/**
 * Writes need the order in one of `statuses`, before its window ends unless `unexpired` is false,
 * at the version the client loaded. An expired window blocks writes: expiry wins (plan §6).
 */
function assertState(
  order: Order | undefined,
  version: number,
  statuses: OrderStatus[],
  message: string,
  unexpired = true,
): asserts order is Order {
  if (!order || !statuses.includes(order.status) || (unexpired && order.windowEnd <= new Date())) {
    throw new AppError(409, ErrorCode.INVALID_STATE, message);
  }
  if (order.version !== version) {
    throw new AppError(409, ErrorCode.VERSION_CONFLICT, 'The order has changed since you loaded it. Reload and try again.');
  }
}

const pickupSnapshot = (l: Location) => ({ pickupLocationId: l.id, pickupName: l.name, pickupLat: l.lat, pickupLon: l.lon });
const deliverySnapshot = (l: Location) => ({
  deliveryLocationId: l.id,
  deliveryName: l.name,
  deliveryLat: l.lat,
  deliveryLon: l.lon,
});

const logger = new Logger('Order');

const NOT_EDITABLE = 'Only open PENDING orders can be edited.';
const NOT_AVAILABLE = 'This order is no longer available.';
const NOT_CANCELLABLE = 'Only PENDING orders can be cancelled directly. Once accepted, propose a cancellation.';

/** Courier lifecycle steps: the new status, the status it must come from, and why it was refused. */
const STEPS = {
  PICKED_UP: { from: 'ACCEPTED', message: 'Only ACCEPTED orders within their window can be picked up.' },
  IN_PROGRESS: { from: 'PICKED_UP', message: 'Only PICKED_UP orders within their window can start delivery.' },
  ARRIVED: { from: 'IN_PROGRESS', message: 'Only IN_PROGRESS orders within their window can be marked arrived.' },
} as const satisfies Record<string, { from: OrderStatus; message: string }>;
export type Step = keyof typeof STEPS;

// Authorization is by ownership/assignment, never by requester/courier UI mode (root AGENTS.md §5).
@Injectable()
export class OrdersService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly supplier: SupplierClient,
    private readonly credit: CreditClient,
    private readonly creditCommands: CreditCommands,
  ) {}

  list(list: OrderList, caller: Caller, page: PageQuery): Promise<Page<Order>> {
    return this.orders.list(list, caller.id, page);
  }

  async get(caller: Caller, orderId: string): Promise<Order> {
    const order = await this.find(orderId);
    if (!isParticipant(order, caller) && !isAvailable(order)) throw forbidden();
    return order;
  }

  async history(caller: Caller, orderId: string): Promise<HistoryEntry[]> {
    await this.participantOrder(caller, orderId);
    return this.orders.history(orderId);
  }

  /** The order, if the caller is its requester or assigned courier. */
  async participantOrder(caller: Caller, orderId: string): Promise<Order> {
    const order = await this.find(orderId);
    if (!isParticipant(order, caller)) throw forbidden();
    return order;
  }

  /**
   * Saves the order as AWAITING_CREDIT, reserves credits, then opens it as PENDING. If the
   * reservation fails, the order is cancelled and any hold released; settleCredits() retries.
   */
  async create(caller: Caller, authorization: string, body: CreateOrderBody): Promise<Order> {
    const window = defaultWindow(body.windowStart, body.windowEnd);
    assertValidWindow(window);
    const [pickup, delivery] = await Promise.all([
      this.activeLocation(body.pickupLocationId, authorization),
      this.activeLocation(body.deliveryLocationId, authorization),
    ]);
    assertPickupOpen(window, pickup);

    const order = await this.orders.transaction(async (tx) => {
      const order = await this.orders.insert(tx, {
        orderDescription: body.orderDescription,
        requesterId: caller.id,
        creditOffer: body.creditOffer,
        ...window,
        ...pickupSnapshot(pickup),
        ...deliverySnapshot(delivery),
      });
      await this.orders.addHistory(tx, {
        orderId: order.id,
        actorId: caller.id,
        action: 'CREATED',
        previousStatus: null,
        newStatus: 'AWAITING_CREDIT',
      });
      return order;
    });

    try {
      await this.credit.reserve(order.id, caller.id, order.creditOffer);
    } catch (error) {
      // Insufficient credits means Credit kept nothing. Anything else (e.g. a timeout) may still
      // have saved a hold, so release it.
      const noHold = error instanceof AppError && error.code === ErrorCode.INSUFFICIENT_CREDITS;
      await this.cancelAwaitingCredit(order.id, noHold)
        .then(() => (noHold ? undefined : this.settle({ id: order.id, status: 'CANCELLED', courierId: null })))
        .catch(() => undefined); // settleCredits() finishes whatever failed here
      throw error;
    }

    const placed = await this.orders.transaction(async (tx) => {
      const placed = await this.orders.setStatus(tx, order.id, 'AWAITING_CREDIT', 'PENDING');
      if (placed) {
        await this.orders.addHistory(tx, {
          orderId: order.id,
          actorId: caller.id,
          action: 'CREDIT_RESERVED',
          previousStatus: 'AWAITING_CREDIT',
          newStatus: 'PENDING',
        });
      }
      return placed;
    });
    // Only if settleCredits() cancelled it first, which needs this request to stall for 30 s.
    if (!placed) throw new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, 'Creating the order took too long. Try again.');
    return placed;
  }

  /**
   * Background job (main.ts runs it every 10 s): cancels creates that never finished, then sends
   * Credit a transfer for each unsettled COMPLETED order and a release for each unsettled CANCELLED
   * one. The orders table is the outbox: an order is marked settled only once Kafka has stored its
   * command, so a crash resends it (Credit ignores repeats). Stops at the first failure, since
   * Kafka is then likely down.
   */
  async settleCredits(): Promise<void> {
    let orderId: string | undefined;
    try {
      for (orderId of await this.orders.staleAwaitingCredit()) await this.cancelAwaitingCredit(orderId);
      for (const order of await this.orders.unsettled()) {
        orderId = order.id;
        await this.settle(order);
      }
    } catch {
      logger.warn(JSON.stringify({ event: 'CREDIT_SETTLEMENT_FAILED', orderId: orderId ?? null }));
    }
  }

  /**
   * Background job (main.ts runs it every 60 s): cancels PENDING, ACCEPTED, PICKED_UP and
   * IN_PROGRESS orders once now >= window_end; ARRIVED never expires. Each order is rechecked under
   * its row lock, so a step or approval that committed first wins if it left the order unexpirable.
   * A pending timing change becomes EXPIRED and a pending cancellation SUPERSEDED (plan §2).
   * settleCredits() then releases the hold. Stops at the first failure, since the database is then
   * likely down.
   */
  async expireOrders(): Promise<void> {
    let orderId: string | undefined;
    try {
      for (orderId of await this.orders.expired()) await this.expire(orderId);
    } catch {
      logger.warn(JSON.stringify({ event: 'ORDER_EXPIRY_FAILED', orderId: orderId ?? null }));
    }
  }

  /** Its CANCELLED history entry is the OrderCancelled event (OrderEvents publishes it). */
  private expire(orderId: string): Promise<void> {
    return this.orders.transaction(async (tx) => {
      const order = await this.orders.lockExpired(tx, orderId);
      if (!order) return;
      await this.orders.setStatus(tx, orderId, order.status, 'CANCELLED');
      await this.orders.supersedePending(tx, orderId, ['TIMING_CHANGE'], 'EXPIRED');
      await this.orders.supersedePending(tx, orderId, ['CANCELLATION']); // COMPLETION needs ARRIVED
      await this.orders.addHistory(tx, {
        orderId,
        actorId: null, // system action
        action: 'CANCELLED',
        previousStatus: order.status,
        newStatus: 'CANCELLED',
        changeDetails: { reason: 'EXPIRED' },
      });
    });
  }

  /** Requester-only, PENDING-only. Pickup hours are rechecked whenever pickup or timing changes. */
  async edit(caller: Caller, authorization: string, orderId: string, body: EditOrderBody): Promise<Order> {
    const order = await this.find(orderId);
    if (order.requesterId !== caller.id) throw forbidden('Only the requester can edit this order.');
    assertState(order, body.version, ['PENDING'], NOT_EDITABLE);

    const { version, pickupLocationId, deliveryLocationId, windowStart, windowEnd, orderDescription } = body;
    const edit: OrderEdit = {};
    if (orderDescription !== undefined) edit.orderDescription = orderDescription;
    if (windowStart) edit.windowStart = windowStart;
    if (windowEnd) edit.windowEnd = windowEnd;
    const window = { windowStart: windowStart ?? order.windowStart, windowEnd: windowEnd ?? order.windowEnd };
    if (windowStart || windowEnd) assertValidWindow(window);

    if (pickupLocationId !== undefined || windowStart || windowEnd) {
      const pickup = await this.activeLocation(pickupLocationId ?? order.pickupLocationId, authorization);
      assertPickupOpen(window, pickup);
      if (pickupLocationId !== undefined) Object.assign(edit, pickupSnapshot(pickup));
    }
    if (deliveryLocationId !== undefined) {
      Object.assign(edit, deliverySnapshot(await this.activeLocation(deliveryLocationId, authorization)));
    }

    return this.orders.transaction(async (tx) => {
      const updated = await this.orders.update(tx, orderId, version, edit);
      if (!updated) {
        assertState(await this.orders.findById(orderId, tx), version, ['PENDING'], NOT_EDITABLE);
        throw new AppError(409, ErrorCode.INVALID_STATE, NOT_EDITABLE);
      }
      const changes = Object.fromEntries(
        Object.entries(edit).map(([field, to]) => [field, { from: order[field as keyof OrderEdit], to }]),
      );
      await this.orders.addHistory(tx, {
        orderId,
        actorId: caller.id,
        action: 'EDITED',
        previousStatus: 'PENDING',
        newStatus: 'PENDING',
        changeDetails: changes,
      });
      return updated;
    });
  }

  /** Atomic: of several couriers accepting at once, exactly one succeeds. */
  async accept(caller: Caller, orderId: string, version: number): Promise<Order> {
    const order = await this.find(orderId);
    if (order.requesterId === caller.id) throw forbidden('You cannot accept your own order.');
    assertState(order, version, ['PENDING'], NOT_AVAILABLE);

    return this.orders.transaction(async (tx) => {
      const accepted = await this.orders.accept(tx, orderId, caller.id, version).catch((error) => {
        if (error?.constraint === 'orders_one_active_courier_idx') {
          throw new AppError(409, ErrorCode.COURIER_BUSY, 'You already have an active order. Finish it before accepting another.');
        }
        throw error;
      });
      if (!accepted) {
        // Lost a race: report why from the current row.
        assertState(await this.orders.findById(orderId, tx), version, ['PENDING'], NOT_AVAILABLE);
        throw new AppError(409, ErrorCode.INVALID_STATE, NOT_AVAILABLE);
      }
      await this.orders.addHistory(tx, {
        orderId,
        actorId: caller.id,
        action: 'ACCEPTED',
        previousStatus: 'PENDING',
        newStatus: 'ACCEPTED',
      });
      return accepted;
    });
  }

  /** Assigned courier only: ACCEPTED → PICKED_UP → IN_PROGRESS → ARRIVED, one step at a time. */
  async advance(caller: Caller, orderId: string, version: number, step: Step): Promise<Order> {
    const { from, message } = STEPS[step];
    const order = await this.find(orderId);
    if (order.courierId !== caller.id) throw forbidden('Only the assigned courier can update this order.');
    assertState(order, version, [from], message);

    return this.orders.transaction(async (tx) => {
      const updated = await this.orders.transition(tx, orderId, version, from, step, true);
      if (!updated) {
        assertState(await this.orders.findById(orderId, tx), version, [from], message);
        throw new AppError(409, ErrorCode.INVALID_STATE, message);
      }
      // ARRIVED allows no timing changes, so a pending one could only block COMPLETION proposals.
      if (step === 'ARRIVED') await this.orders.supersedePending(tx, orderId, ['TIMING_CHANGE']);
      await this.orders.addHistory(tx, { orderId, actorId: caller.id, action: step, previousStatus: from, newStatus: step });
      return updated;
    });
  }

  /**
   * Requester only, PENDING only, even after the window has ended. Accepted orders need a
   * CANCELLATION proposal. settleCredits() releases the hold, as for every CANCELLED order.
   */
  async cancel(caller: Caller, orderId: string, version: number): Promise<Order> {
    const order = await this.find(orderId);
    if (order.requesterId !== caller.id) throw forbidden('Only the requester can cancel this order.');
    assertState(order, version, ['PENDING'], NOT_CANCELLABLE, false);

    return this.orders.transaction(async (tx) => {
      const cancelled = await this.orders.transition(tx, orderId, version, 'PENDING', 'CANCELLED', false);
      if (!cancelled) {
        assertState(await this.orders.findById(orderId, tx), version, ['PENDING'], NOT_CANCELLABLE, false);
        throw new AppError(409, ErrorCode.INVALID_STATE, NOT_CANCELLABLE);
      }
      await this.orders.addHistory(tx, {
        orderId,
        actorId: caller.id,
        action: 'CANCELLED',
        previousStatus: 'PENDING',
        newStatus: 'CANCELLED',
        changeDetails: { reason: 'REQUESTER_CANCELLED' },
      });
      return cancelled;
    });
  }

  /** `settled`: Credit is known to hold nothing, so no release is needed. */
  private cancelAwaitingCredit(orderId: string, settled = false): Promise<void> {
    return this.orders.transaction(async (tx) => {
      if (!(await this.orders.setStatus(tx, orderId, 'AWAITING_CREDIT', 'CANCELLED'))) return;
      if (settled) await this.orders.markCreditSettled(orderId, tx);
      await this.orders.addHistory(tx, {
        orderId,
        actorId: null, // system action
        action: 'CANCELLED',
        previousStatus: 'AWAITING_CREDIT',
        newStatus: 'CANCELLED',
        changeDetails: { reason: 'CREDIT_NOT_RESERVED' },
      });
    });
  }

  private async settle({ id, status, courierId }: Unsettled): Promise<void> {
    if (status === 'COMPLETED') await this.creditCommands.transfer(id, courierId!);
    else await this.creditCommands.release(id);
    await this.orders.markCreditSettled(id);
  }

  private async find(orderId: string): Promise<Order> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new AppError(404, ErrorCode.NOT_FOUND, 'Order not found.');
    return order;
  }

  async activeLocation(id: number, authorization: string): Promise<Location> {
    const location = await this.supplier.getLocation(id, authorization);
    if (location.status !== 'ACTIVE') {
      throw new AppError(409, ErrorCode.LOCATION_INACTIVE, `${location.name} is not currently active.`);
    }
    return location;
  }
}
