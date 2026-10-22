/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
 * Scope: Generated the X-Service-Key guard for the /internal/credits routes (design confirmed by
 *        Jian Bing: the pattern user-service/AGENTS.md documents for its /internal routes).
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Log the path without its query string (PR #48 review).
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Wrote the 2026-10-18 Author review text above from Jian Bing's account of what he checked (PR #97).
 * Author review: Jian Bing supplied what it states; the wording is Claude's.
 */
import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { config } from '../config';
import { ProblemException } from './problem';

const logger = new Logger('Access');

export const SERVICE_KEY_HEADER = 'x-service-key';

/**
 * Compares two keys in constant time. Both are hashed first, because timingSafeEqual throws on
 * inputs of different lengths, and an early length check would reveal the real key's length.
 */
export function keysMatch(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Only the Order Service may move credits. It proves that by sending the shared key; the gateway
 * never routes /internal/** (user-service/AGENTS.md), so browsers cannot reach these routes.
 * Because the caller is trusted, the requester and courier ids may come from the request body,
 * an agreed exception to root AGENTS.md §8 (auto-cancel has no user token to forward).
 */
@Injectable()
export class ServiceKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const given = req.header(SERVICE_KEY_HEADER);
    if (given && keysMatch(given, config.serviceKey)) return true;

    // Same structured format as the Supplier Service, for the centralized logging N2H.
    // Never logs the key that was sent.
    logger.warn(
      JSON.stringify({
        event: 'access_denied',
        status: 401,
        method: req.method,
        // The path only: a query string could carry a secret (PR #48 review).
        path: req.originalUrl.split('?')[0],
        reason: given ? 'invalid_service_key' : 'missing_service_key',
      }),
    );
    throw new ProblemException(401, 'A valid X-Service-Key header is required.');
  }
}
