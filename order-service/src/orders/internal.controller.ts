/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Generated GET /internal/orders/users/:userId/active for the User Service's deactivation
 *        check (plan §4, Phase D); response shape and service-key auth decided by Zi Yi, 2026-10-18.
 * Author review: Reviewed
 */
import { Controller, Get, Param } from '@nestjs/common';
import { Internal } from '../common/service-key.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OrdersRepository } from './orders.repository';
import { OrderIdParam } from './orders.schemas';

const userId = new ZodValidationPipe(OrderIdParam); // any UUID

@Internal()
@Controller('internal/orders')
export class InternalController {
  constructor(private readonly orders: OrdersRepository) {}

  /**
   * Whether the user is requester or courier on an order that has not finished (any status but
   * COMPLETED/CANCELLED). The User Service refuses deactivation while true; it owns that rule.
   */
  @Get('users/:userId/active')
  async active(@Param('userId', userId) id: string) {
    return { userId: id, hasActiveOrders: await this.orders.hasActiveOrders(id) };
  }
}
