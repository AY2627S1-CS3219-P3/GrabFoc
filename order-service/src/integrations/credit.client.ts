/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated the Credit Service reserve and release client (Phase B), matching Credit's
 *        POST /internal/credits/reserve|release contract on feature/credit-service.
 * Author review: Reviewed.
 */
import { Injectable } from '@nestjs/common';
import { AppError, ErrorCode } from '../common/errors';
import { appConfig } from '../config';

const unavailable = () =>
  new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, 'Credits cannot be reserved right now. Try again shortly.');

@Injectable()
export class CreditClient {
  private readonly config = appConfig();

  /** Moves `amount` of the requester's credits into a hold for this order. 201 new, 200 repeat. */
  async reserve(orderId: string, requesterId: string, amount: number): Promise<void> {
    const res = await this.post('reserve', { orderId, requesterId, amount });
    // The order ID is new, so Credit's only 409 here is insufficient credits.
    if (res.status === 409) {
      throw new AppError(409, ErrorCode.INSUFFICIENT_CREDITS, 'You do not have enough credits for this offer.');
    }
    if (!res.ok) throw unavailable();
  }

  /**
   * Returns the order's held credits; 200 also on a repeat, 404 when Credit has no hold.
   * Known limitation: until Credit saves a RELEASED marker on that 404, a reserve still running
   * inside Credit can land afterwards and stay held.
   */
  async release(orderId: string): Promise<void> {
    const res = await this.post('release', { orderId });
    if (!res.ok && res.status !== 404) throw unavailable();
  }

  private async post(action: string, body: object): Promise<Response> {
    try {
      return await fetch(`${this.config.creditUrl}/internal/credits/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-service-key': this.config.creditServiceKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw unavailable();
    }
  }
}
