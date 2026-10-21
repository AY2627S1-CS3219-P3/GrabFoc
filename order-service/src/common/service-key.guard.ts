/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Generated the X-Service-Key guard for Order's /internal routes (Phase D), following
 *        credit-service/src/common/service-key.guard.ts, as Zi Yi decided on 2026-10-18.
 * Author review: Reviewed
 */
import { applyDecorators, CanActivate, ExecutionContext, Injectable, SetMetadata, UseGuards } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { appConfig } from '../config';
import { AppError, ErrorCode } from './errors';

export const INTERNAL = 'internal';

/**
 * Compares two keys in constant time. Both are hashed first, because timingSafeEqual throws on
 * inputs of different lengths, and an early length check would reveal the real key's length.
 */
function keysMatch(given: string, expected: string): boolean {
  return timingSafeEqual(createHash('sha256').update(given).digest(), createHash('sha256').update(expected).digest());
}

/** Only other services hold the key; the gateway never routes /internal/**, so browsers can't reach it. */
@Injectable()
export class ServiceKeyGuard implements CanActivate {
  private readonly key = appConfig().serviceKey;

  canActivate(context: ExecutionContext): boolean {
    const given = context.switchToHttp().getRequest<Request>().header('x-service-key');
    // The error filter logs the 401 without the key.
    if (!given || !keysMatch(given, this.key)) {
      throw new AppError(401, ErrorCode.SERVICE_KEY_INVALID, 'A valid X-Service-Key header is required.');
    }
    return true;
  }
}

/** For service-to-service controllers: the service key replaces the user token. */
export const Internal = () => applyDecorators(SetMetadata(INTERNAL, true), UseGuards(ServiceKeyGuard));
