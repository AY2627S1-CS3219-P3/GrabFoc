/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-23
 * Scope: Generated this middleware, from Cole Lin's decision on 2026-10-23 that every request
 *        should be logged rather than only the failures (issue #52).
 * Author review: Cole Lin, read and approved.
 */
import type { NextFunction, Request, Response } from 'express';
import type { AuthedRequest } from './auth';
import { log } from './log';
import { logPath, requestIdOf } from './request-id';

// AI-generated (reviewed by Cole Lin).

/**
 * One `request_completed` line per request, whatever the outcome.
 *
 * **Middleware, not a Nest interceptor.** Guards run *before* interceptors, so an interceptor never
 * sees a request the `JwtAuthGuard` refused — it would miss every 401 and 403, which is most of
 * what anyone wants to look up. It would miss a 404 for an unrouted path too. A `finish` listener
 * registered here fires for all of them, including a response written by the exception filter.
 *
 * This is the *uniform* per-request record: status, duration, who. `access_denied` stays separate
 * and carries why, because the backlog asks for unauthorised attempts specifically (U5.1.1). So a
 * refused request produces two lines from this service, sharing a `requestId` — which means any
 * "how many denials" query has to pick one event and stay with it.
 *
 * The caller comes from `req.caller`, which the guard sets after verifying the token, so it is
 * present on a 403 and on anything authorised, and absent on a 401.
 */
export function requestLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();
  let emitted = false;

  const emit = () => {
    // `finish` and `close` both fire for a normal response, and only `close` fires when the client
    // goes away mid-response. One line either way.
    if (emitted) return;
    emitted = true;

    const status = res.statusCode;
    const caller = (req as AuthedRequest).caller;
    log.emit({
      level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
      event: 'request_completed',
      requestId: requestIdOf(req),
      method: req.method,
      // The pathname only. A location search carries the caller's coordinates, and this line also
      // carries their userId (root AGENTS.md: never log unmasked personal data).
      path: logPath(req),
      status,
      durationMs: Number((process.hrtime.bigint() - startedAt) / 1_000_000n),
      userId: caller?.id,
      role: caller?.role,
      // True when the client gave up before the response was written, which otherwise looks
      // identical to a fast success.
      ...(res.writableFinished ? {} : { aborted: true }),
    });
  };

  res.on('finish', emit);
  res.on('close', emit);
  next();
}
