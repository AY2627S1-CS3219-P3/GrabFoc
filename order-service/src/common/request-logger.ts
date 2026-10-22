/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated the structured request-log middleware (Phase A).
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
 */
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const logger = new Logger('Request');

/** One JSON line per request. Logs the path without its query string, and no headers or bodies. */
export function requestLogger(req: Request & { caller?: { id: string } }, res: Response, next: NextFunction) {
  const started = performance.now();
  res.on('finish', () => {
    logger.log(
      JSON.stringify({
        event: 'REQUEST',
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Math.round(performance.now() - started),
        userId: req.caller?.id ?? null,
      }),
    );
  });
  next();
}
