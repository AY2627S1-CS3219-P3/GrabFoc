/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated the Phase A read routes from order-service-plan.md §3.
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
 */
import { Controller, Get, Param, Query } from '@nestjs/common';
import { Caller, CurrentUser } from '../common/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OrderIdParam, PageQuery } from './orders.schemas';
import { OrdersService } from './orders.service';

const orderId = new ZodValidationPipe(OrderIdParam);
const pageQuery = new ZodValidationPipe(PageQuery);

// Static routes are declared before `:orderId` so Nest matches them first.
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Unexpired PENDING orders the caller could accept (excludes their own). */
  @Get('available')
  available(@CurrentUser() caller: Caller, @Query(pageQuery) page: PageQuery) {
    return this.orders.list('available', caller, page);
  }

  /** Every order the caller created, in any status. */
  @Get('mine')
  mine(@CurrentUser() caller: Caller, @Query(pageQuery) page: PageQuery) {
    return this.orders.list('requester', caller, page);
  }

  /** Every order assigned to the caller as courier, in any status. */
  @Get('assigned')
  assigned(@CurrentUser() caller: Caller, @Query(pageQuery) page: PageQuery) {
    return this.orders.list('courier', caller, page);
  }

  @Get(':orderId')
  get(@CurrentUser() caller: Caller, @Param('orderId', orderId) id: string) {
    return this.orders.get(caller, id);
  }

  @Get(':orderId/history')
  async history(@CurrentUser() caller: Caller, @Param('orderId', orderId) id: string) {
    return { items: await this.orders.history(caller, id) };
  }
}
