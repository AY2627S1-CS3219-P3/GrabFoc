/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-11
 * Scope: Generated the correlation-id middleware and helpers, following the team's decision to
 *        join log lines across services on the gateway's x-request-id (see "Logging" in
 *        supplier-service/AGENTS.md).
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Added logPath() after the PR #90 review found query strings were reaching the logs.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-23
 * Scope: logPath returns the route template rather than the caller's pathname, so a secret in a
 *        path segment cannot reach the log store (PR #145 review).
 * Author review: Cole Lin, read and approved.
 * Author review (Cole Lin): Read in full; ran `npm test` (176 passed) and checked a supplied id,
 *        a minted one and a rejected one all reach the log line and the response header, and that
 *        a query string never reaches a log line.
 */
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

// AI-generated (reviewed by Cole Lin).

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

/**
 * The path to put in a log line: **the route template, never the caller's URL.**
 *
 * `/locations/:locationId`, not `/locations/7` and certainly not
 * `/locations/eyJhbGciOiJSUzI1NiJ9.whatever-the-caller-put-there`. A caller chooses every byte of a
 * URL, and the shipper's redaction matches field *names*, so it sees a harmless `path` key and lets
 * the value through — a token or an email sitting in a path segment would reach the store verbatim
 * (PR #145 review). The template contains no caller data at all, and it groups better: a thousand
 * lookups aggregate to one route rather than a thousand paths.
 *
 * Express fills `req.route` once routing has matched, which is before any guard runs and so before
 * any line this service writes. When nothing matched — a 404 for a path somebody invented — there
 * is no template, and that is exactly the case where the URL is arbitrary caller content, so it
 * becomes a placeholder. The raw path is still in the gateway's own log if anyone needs it.
 */
export function logPath(req: Request): string {
  const route = (req as { route?: { path?: string } }).route?.path;
  if (route) return `${req.baseUrl ?? ''}${route}`;
  return UNROUTED;
}

export const UNROUTED = '/<unrouted>';
