/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
 * Scope: Generated the client for the Order Service's GET /internal/orders/users/:userId/active
 *        (#71). Fail closed (503) when Order cannot answer, as Zi Yi chose.
 * Author review: Reviewed by Zi Yi, 2026-10-20.
 */
// AI-generated (reviewed by Zi Yi)
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppError } from '../common/errors/app-error';
import { ErrorCode } from '../common/errors/error-codes';
import type { AppConfig } from '../config/env.validation';

const TIMEOUT_MS = 3000;

/** The one call this service makes to the Order Service. */
@Injectable()
export class OrderClient {
  private readonly logger = new Logger('OrderClient');

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  /**
   * Whether the user is requester or courier on any order that is not COMPLETED/CANCELLED.
   * Throws 503 when Order is unreachable or answers anything but 200: a deactivation is
   * refused rather than let through for someone who may still have live orders.
   */
  async hasActiveOrders(userId: string): Promise<boolean> {
    const { url, serviceKey } = this.config.get('order', { infer: true });
    let status: number | null = null;
    try {
      const res = await fetch(`${url}/internal/orders/users/${encodeURIComponent(userId)}/active`, {
        headers: { 'X-Service-Key': serviceKey },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = res.status;
      if (res.ok) {
        const body = (await res.json()) as { hasActiveOrders?: unknown };
        if (typeof body.hasActiveOrders === 'boolean') return body.hasActiveOrders;
      }
    } catch {
      // Network error, timeout or a non-JSON body: handled below like any other failure.
    }
    this.logger.warn({ event: 'ORDER_ACTIVE_CHECK_FAILED', userId, status });
    throw new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, 'Your orders cannot be checked right now. Try again shortly.');
  }
}
