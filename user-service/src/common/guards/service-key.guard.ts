/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-02
 * Scope: Copied from order-service/src/common/service-key.guard.ts for the /internal/users routes
 *        (#151); reads the key from ConfigService and skips AuthGuard with @Public().
 * Author review: pending — Jie Yang to record the review; Deanson / Zi Yi (User owners) to review.
 */
// AI-generated (pending review)
import { applyDecorators, CanActivate, ExecutionContext, Injectable, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { AppConfig } from '../../config/env.validation';
import { Public } from '../decorators/public.decorator';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';

/**
 * Compares two keys in constant time. Both are hashed first, because timingSafeEqual throws on
 * inputs of different lengths, and an early length check would reveal the real key's length.
 */
export function keysMatch(given: string, expected: string): boolean {
  return timingSafeEqual(createHash('sha256').update(given).digest(), createHash('sha256').update(expected).digest());
}

/** Only other services hold the key; the gateway never routes /internal/**, so browsers can't reach it. */
@Injectable()
export class ServiceKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const given = context.switchToHttp().getRequest<Request>().header('x-service-key');
    // ErrorFilter logs the 401 without the key (the logger redacts X-Service-Key).
    if (!given || !keysMatch(given, this.config.get('internalServiceKey', { infer: true }))) {
      throw new AppError(401, ErrorCode.SERVICE_KEY_INVALID, 'A valid X-Service-Key header is required.');
    }
    return true;
  }
}

/**
 * For service-to-service controllers: the service key replaces the user token. @Public() opts out
 * of the global AuthGuard, so a user token alone never opens these routes.
 */
export const Internal = () => applyDecorators(Public(), UseGuards(ServiceKeyGuard));
