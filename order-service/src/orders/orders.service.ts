/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated the participant authorization rules for the Phase A read endpoints.
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
 */
import { Injectable } from '@nestjs/common';
import type { Caller } from '../common/jwt-auth.guard';
import { AppError, ErrorCode } from '../common/errors';
import { OrderList, OrdersRepository } from './orders.repository';
import type { HistoryEntry, Order, Page, PageQuery } from './orders.schemas';

const isParticipant = (order: Order, caller: Caller) =>
  order.requesterId === caller.id || order.courierId === caller.id;

/** Open for acceptance, so any caller may view it before deciding (plan §3, GET /orders/:orderId). */
const isAvailable = (order: Order) => order.status === 'PENDING' && order.windowEnd > new Date();

const forbidden = () =>
  new AppError(403, ErrorCode.FORBIDDEN, 'Only the requester or assigned courier can view this order.');

// Authorization is by ownership/assignment, never by requester/courier UI mode (root AGENTS.md §5).
@Injectable()
export class OrdersService {
  constructor(private readonly orders: OrdersRepository) {}

  list(list: OrderList, caller: Caller, page: PageQuery): Promise<Page<Order>> {
    return this.orders.list(list, caller.id, page);
  }

  async get(caller: Caller, orderId: string): Promise<Order> {
    const order = await this.find(orderId);
    if (!isParticipant(order, caller) && !isAvailable(order)) throw forbidden();
    return order;
  }

  async history(caller: Caller, orderId: string): Promise<HistoryEntry[]> {
    const order = await this.find(orderId);
    if (!isParticipant(order, caller)) throw forbidden();
    return this.orders.history(orderId);
  }

  private async find(orderId: string): Promise<Order> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new AppError(404, ErrorCode.NOT_FOUND, 'Order not found.');
    return order;
  }
}
