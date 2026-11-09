/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated the Supplier Service HTTP client for location lookups (Phase B).
 * Author review: Read in full
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Review: forward x-request-id, so this call is stored under the same id as the
 *        request that made it (issue #52).
 * Author review: Cole Lin, read and approved.
 */
import { requestIdHeader } from '../common/request-id';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppError, ErrorCode } from '../common/errors';
import { appConfig } from '../config';

const HHMM = z.string().regex(/^([01]\d|2[0-3])[0-5]\dhrs$/);

// Only the fields Order uses; Supplier's other fields are ignored.
const LocationBody = z.object({
  id: z.number().int(),
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  open_time: HHMM.nullable(),
  close_time: HHMM.nullable(),
});

export interface Location {
  id: number;
  name: string;
  lat: number;
  lon: number;
  status: 'ACTIVE' | 'INACTIVE';
  /** `HHMMhrs` campus time; both null when the location has no set hours. */
  openTime: string | null;
  closeTime: string | null;
}

const unavailable = () =>
  new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, 'Location details are unavailable right now. Try again shortly.');

@Injectable()
export class SupplierClient {
  private readonly baseUrl = appConfig().supplierUrl;

  /** Supplier authorizes on the caller's own token, so it is forwarded as-is. */
  async getLocation(id: number, authorization: string): Promise<Location> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/locations/${id}`, {
        // Forwarded so Supplier's lines for this call carry the same id as Order's, instead of
        // Supplier minting its own and the one flow splitting into two traces (issue #52).
        headers: { authorization, ...requestIdHeader() },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw unavailable();
    }
    if (res.status === 404) throw new AppError(404, ErrorCode.NOT_FOUND, `Location ${id} not found.`);
    if (!res.ok) throw unavailable();

    const body = LocationBody.safeParse(await res.json().catch(() => undefined));
    if (!body.success) throw unavailable();
    const { open_time, close_time, ...location } = body.data;
    return { ...location, openTime: open_time, closeTime: close_time };
  }
}
