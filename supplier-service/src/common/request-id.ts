/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-11
 * Scope: Generated the correlation-id middleware and helpers, following the team's decision to
 *        join log lines across services on the gateway's x-request-id (see "Logging" in
 *        supplier-service/AGENTS.md).
 * Author review (Cole Lin): Read in full; ran `npm test` (171 passed) and checked a supplied id,
 *        a minted one and a rejected one all reach the log line and the response header.
 */
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * The same shape the API Gateway accepts in api-gateway/src/request-logger.ts. The header is
 * client-controlled and ends up in a log line, so cap its length and character set: an
 * unbounded value pollutes log storage, and the charset keeps the value a single token.
 */
const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export type TracedRequest = Request & { requestId?: string };

/**
 * The caller's request id, or a fresh one. A malformed or missing header is replaced rather
 * than rejected: this is diagnostic metadata, so a bad value must never fail a request that
 * would otherwise succeed. Minting one matters for direct calls (Postman on :3002, which never
 * passes through the gateway) — without it every local log line would be unjoinable.
 */
export function resolveRequestId(header: string | string[] | undefined): string {
  const candidate = Array.isArray(header) ? header[0] : header;
  return typeof candidate === 'string' && VALID_REQUEST_ID.test(candidate) ? candidate : randomUUID();
}

/** Stores the request id on the request and echoes it back, so a bug report can quote it. */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = resolveRequestId(req.headers['x-request-id']);
  (req as TracedRequest).requestId = id;
  res.setHeader('x-request-id', id);
  next();
}

/**
 * The id the middleware stored; falls back to the header so log sites never record null. Guards
 * `headers` because unit tests and other non-HTTP callers pass a partial request object.
 */
export function requestIdOf(req: Request): string {
  return (req as TracedRequest).requestId ?? resolveRequestId(req.headers?.['x-request-id']);
}
