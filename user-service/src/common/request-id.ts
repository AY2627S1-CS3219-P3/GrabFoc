/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Copied from supplier-service/src/common/request-id.ts, so every service joins its
 *        log lines on the gateway's x-request-id and reports the route template rather than
 *        the caller's URL (issue #52).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Review: a request-scoped store for the id, so a call to another service can carry
 *        it and both halves of one flow are stored under one id (issue #52).
 * Author review: Cole Lin, read and approved.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
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
 * would otherwise succeed. Minting one matters for direct calls (Postman against this service's own port,
 * which never passes through the gateway) — without it every local log line would be unjoinable.
 */
export function resolveRequestId(header: string | string[] | undefined): string {
  const candidate = Array.isArray(header) ? header[0] : header;
  return typeof candidate === 'string' && VALID_REQUEST_ID.test(candidate) ? candidate : randomUUID();
}

/**
 * The id for the work happening right now, for code with no request object to read it from.
 *
 * A service layer calling another service has the id nowhere in its signature, so the call went
 * out without `x-request-id`, the far side minted its own, and the two services stored their
 * halves of one flow under different ids - which defeats the only question this logging is for.
 * Threading a parameter through every method that might make a call would touch most of a service;
 * the request-scoped store costs one wrapper here and a header at each call site.
 */
const currentId = new AsyncLocalStorage<string>();

/** The id for the request being handled, or undefined outside one (a job, a test, startup). */
export function currentRequestId(): string | undefined {
  return currentId.getStore();
}

/**
 * The `x-request-id` header for an outbound call, or nothing outside a request. Spread into a
 * headers object: `{ ...requestIdHeader() }`. Nothing, rather than an empty value, because an empty
 * header reads as "there was no request" and the far side would mint an id anyway.
 */
export function requestIdHeader(): Record<string, string> {
  const id = currentRequestId();
  return id ? { 'x-request-id': id } : {};
}

/** Stores the request id on the request and echoes it back, so a bug report can quote it. */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = resolveRequestId(req.headers['x-request-id']);
  (req as TracedRequest).requestId = id;
  res.setHeader('x-request-id', id);
  // next() runs inside the store, so everything downstream - guards, handlers, the clients they
  // call - can read the id without being handed it.
  currentId.run(id, () => next());
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
 * `/orders/:orderId`, not `/orders/7` and certainly not
 * `/orders/eyJhbGciOiJSUzI1NiJ9.whatever-the-caller-put-there`. A caller chooses every byte of a
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
