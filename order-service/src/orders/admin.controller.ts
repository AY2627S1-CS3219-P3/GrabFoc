/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-05
 * Scope: Generated the admin dashboard read routes from docs/admin-dashboard-plan.md §5 (#181).
 * Author review: Reviewed by Zi Yi, 2026-11-05.
 */
import { Controller, Get, Param, Query } from '@nestjs/common';
import { AppError, ErrorCode } from '../common/errors';
import { AdminOnly } from '../common/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OrdersRepository } from './orders.repository';
import { ADMIN_SCOPES, AdminOrdersQuery, OrderIdParam } from './orders.schemas';

// Read-only, so a token whose role changed in the last 15 minutes is acceptable.
@AdminOnly()
@Controller('admin/orders')
export class AdminController {
  constructor(private readonly orders: OrdersRepository) {}

  /** Live orders per state, zeros included, and orders cancelled in the last hour. */
  @Get('overview')
  async overview() {
    const [counts, recentCancellations] = await Promise.all([
      this.orders.countByStatus(ADMIN_SCOPES.live),
      this.orders.recentCancellations(),
    ]);
    const byState = Object.fromEntries(ADMIN_SCOPES.live.map((status) => [status, counts[status] ?? 0]));
    const total = Object.values(byState).reduce((sum, n) => sum + n, 0);
    return { live: { total, byState }, recentCancellations };
  }

  @Get()
  list(@Query(new ZodValidationPipe(AdminOrdersQuery)) query: AdminOrdersQuery) {
    const { scope, state, userId } = query;
    const statuses = state ? [state] : scope ? ADMIN_SCOPES[scope] : [...ADMIN_SCOPES.live, ...ADMIN_SCOPES.past];
    return this.orders.adminList(statuses, userId, query);
  }

  @Get(':orderId/history')
  async history(@Param('orderId', new ZodValidationPipe(OrderIdParam)) id: string) {
    if (!(await this.orders.findById(id))) throw new AppError(404, ErrorCode.NOT_FOUND, 'Order not found.');
    return { items: await this.orders.history(id) };
  }
}
