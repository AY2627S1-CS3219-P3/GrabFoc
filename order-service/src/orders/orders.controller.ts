/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated the Phase A read routes from order-service-plan.md §3.
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).

 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Added POST /orders, PATCH /orders/:orderId and POST /orders/:orderId/accept (Phase B).
 * Author review: Reviewed in full.
 */
import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Caller, CurrentUser } from '../common/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CreateOrderBody, EditOrderBody, OrderIdParam, PageQuery, VersionBody } from './orders.schemas';
import { OrdersService } from './orders.service';

const orderId = new ZodValidationPipe(OrderIdParam);
const pageQuery = new ZodValidationPipe(PageQuery);

// The caller's token is forwarded to Supplier, which authorizes location reads itself.

// Static routes are declared before `:orderId` so Nest matches them first.
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(
    @CurrentUser() caller: Caller,
    @Headers('authorization') authorization: string,
    @Body(new ZodValidationPipe(CreateOrderBody)) body: CreateOrderBody,
  ) {
    return this.orders.create(caller, authorization, body);
  }

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

  @Patch(':orderId')
  edit(
    @CurrentUser() caller: Caller,
    @Headers('authorization') authorization: string,
    @Param('orderId', orderId) id: string,
    @Body(new ZodValidationPipe(EditOrderBody)) body: EditOrderBody,
  ) {
    return this.orders.edit(caller, authorization, id, body);
  }

  @Post(':orderId/accept')
  @HttpCode(200)
  accept(
    @CurrentUser() caller: Caller,
    @Param('orderId', orderId) id: string,
    @Body(new ZodValidationPipe(VersionBody)) { version }: VersionBody,
  ) {
    return this.orders.accept(caller, id, version);
  }

  @Get(':orderId/history')
  async history(@CurrentUser() caller: Caller, @Param('orderId', orderId) id: string) {
    return { items: await this.orders.history(caller, id) };
  }
}
