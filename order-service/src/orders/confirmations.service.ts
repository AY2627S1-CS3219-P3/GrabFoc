/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated the TIMING_CHANGE / CANCELLATION / COMPLETION proposal and response rules
 *        (Phase C), from order-service/AGENTS.md and order-service-plan.md §2.
 * Author review: Reviewed
 */
import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Caller } from '../common/jwt-auth.guard';
import { AppError, ErrorCode } from '../common/errors';
import { OrdersRepository, Side } from './orders.repository';
import type { Confirmation, ConfirmationKind, Order, OrderStatus, ProposeBody } from './orders.schemas';
import { OrdersService } from './orders.service';
import { assertPickupOpen, assertValidWindow } from './timing';

/** Which order states each proposal kind needs, both to propose it and to approve it. */
const RULES: Record<ConfirmationKind, { states: OrderStatus[]; unexpired: boolean; message: string }> = {
  TIMING_CHANGE: {
    states: ['ACCEPTED', 'PICKED_UP', 'IN_PROGRESS'],
    unexpired: true,
    message: 'Timing changes need an ACCEPTED, PICKED_UP or IN_PROGRESS order whose window has not ended.',
  },
  // Cancelling is what expiry does anyway, so an ended window does not block it.
  CANCELLATION: {
    states: ['ACCEPTED', 'PICKED_UP', 'IN_PROGRESS', 'ARRIVED'],
    unexpired: false,
    message: 'Only accepted orders that have not finished can be cancelled by agreement.',
  },
  COMPLETION: { states: ['ARRIVED'], unexpired: false, message: 'Only ARRIVED orders can be completed.' },
};

function assertAllows(order: Order, kind: ConfirmationKind): void {
  const rule = RULES[kind];
  if (!rule.states.includes(order.status) || (rule.unexpired && order.windowEnd <= new Date())) {
    throw new AppError(409, ErrorCode.INVALID_STATE, rule.message);
  }
}

const sideOf = (order: Order, caller: Caller): Side => (order.requesterId === caller.id ? 'requester' : 'courier');

/**
 * The proposer's response counts as ACCEPTED; the other participant approves or rejects. Approval
 * locks the order and proposal, rechecks them, and applies the change in one transaction.
 */
@Injectable()
export class ConfirmationsService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly ordersService: OrdersService,
  ) {}

  async list(caller: Caller, orderId: string): Promise<Confirmation[]> {
    await this.ordersService.participantOrder(caller, orderId);
    return this.orders.confirmations(orderId);
  }

  async propose(caller: Caller, authorization: string, orderId: string, body: ProposeBody): Promise<Confirmation> {
    const order = await this.ordersService.participantOrder(caller, orderId);
    if (body.kind === 'TIMING_CHANGE' && order.requesterId !== caller.id) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'Only the requester can propose a timing change.');
    }
    assertAllows(order, body.kind);
    if (body.kind === 'TIMING_CHANGE') {
      assertValidWindow(body);
      // Pickup hours only matter until the items are picked up.
      if (order.status === 'ACCEPTED') {
        assertPickupOpen(body, await this.ordersService.activeLocation(order.pickupLocationId, authorization));
      }
    }

    return this.orders.transaction(async (tx) => {
      assertAllows((await this.orders.lock(tx, orderId))!, body.kind); // recheck under the lock
      const window = body.kind === 'TIMING_CHANGE' ? { windowStart: body.windowStart, windowEnd: body.windowEnd } : {};
      return this.orders
        .propose(tx, orderId, { kind: body.kind, proposedBy: caller.id, proposerSide: sideOf(order, caller), ...window })
        .catch((error) => {
          if (error?.constraint === 'order_confirmations_one_pending_idx') {
            throw new AppError(409, ErrorCode.CONFIRMATION_PENDING, 'This order already has a proposal waiting for a response.');
          }
          throw error;
        });
    });
  }

  async respond(
    caller: Caller,
    orderId: string,
    confirmationId: string,
    response: 'ACCEPTED' | 'REJECTED',
  ): Promise<Confirmation> {
    await this.ordersService.participantOrder(caller, orderId);

    const outcome = await this.orders.transaction(async (tx) => {
      const order = (await this.orders.lock(tx, orderId))!;
      const proposal = await this.orders.lockConfirmation(tx, orderId, confirmationId);
      if (!proposal) throw new AppError(404, ErrorCode.NOT_FOUND, 'Confirmation not found.');
      if (proposal.status !== 'PENDING') {
        throw new AppError(409, ErrorCode.INVALID_STATE, `This proposal is already ${proposal.status}.`);
      }
      const side = sideOf(order, caller);
      const own = side === 'requester' ? proposal.requesterResponse : proposal.courierResponse;
      if (own !== 'PENDING') throw new AppError(409, ErrorCode.INVALID_STATE, 'You have already accepted this proposal.');

      // A timing change expires with the current window, and is moot once the proposed one has ended.
      const now = Date.now();
      if (proposal.kind === 'TIMING_CHANGE' && (order.windowEnd.getTime() <= now || proposal.proposedWindowEnd!.getTime() <= now)) {
        await this.orders.resolve(tx, proposal.id, 'EXPIRED');
        return { expired: true as const };
      }
      if (response === 'REJECTED') {
        return { confirmation: await this.orders.resolve(tx, proposal.id, 'REJECTED', { side, value: response }) };
      }
      assertAllows(order, proposal.kind);
      const approved = await this.orders.resolve(tx, proposal.id, 'APPROVED', { side, value: response });
      await this.apply(tx, order, approved, caller.id);
      return { confirmation: approved };
    });

    // Thrown after the commit, so the proposal stays EXPIRED.
    if ('expired' in outcome) {
      throw new AppError(409, ErrorCode.INVALID_STATE, 'This timing change expired because a window ended before it was approved.');
    }
    return outcome.confirmation;
  }

  /** Applies an approved proposal to the locked, rechecked order, with its history entry. */
  private async apply(tx: PoolClient, order: Order, proposal: Confirmation, actorId: string): Promise<void> {
    const confirmationId = proposal.id;
    if (proposal.kind === 'TIMING_CHANGE') {
      const windowStart = proposal.proposedWindowStart!;
      const windowEnd = proposal.proposedWindowEnd!;
      await this.orders.setWindow(tx, order.id, windowStart, windowEnd);
      await this.orders.addHistory(tx, {
        orderId: order.id,
        actorId,
        action: 'EDITED',
        previousStatus: order.status,
        newStatus: order.status,
        changeDetails: {
          windowStart: { from: order.windowStart, to: windowStart },
          windowEnd: { from: order.windowEnd, to: windowEnd },
          confirmationId,
        },
      });
      return;
    }

    // CANCELLED: cleanUpCredits() releases the hold. COMPLETED: transfer waits for Phase D events.
    const to = proposal.kind === 'COMPLETION' ? 'COMPLETED' : 'CANCELLED';
    await this.orders.setStatus(tx, order.id, order.status, to);
    await this.orders.addHistory(tx, {
      orderId: order.id,
      actorId,
      action: to,
      previousStatus: order.status,
      newStatus: to,
      changeDetails: to === 'CANCELLED' ? { reason: 'MUTUAL_CANCELLATION', confirmationId } : { confirmationId },
    });
  }
}
