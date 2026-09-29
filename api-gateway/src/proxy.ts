/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Added stream-based forwarding; forwarded request IDs and isolated upstream failures; bound forwarding to the selected service origin and stripped cookies on 2026-09-29.
Author review: Jie Yang reviewed the earlier implementation; the proxy security fix awaits his review.
*/
import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';

const excluded = new Set(['host', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade', 'forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-user-id', 'x-user-role', 'cookie']);

// AI-generated (earlier version reviewed by Jie Yang; latest edits pending review)
export function proxy(request: IncomingMessage, response: ServerResponse, upstream: URL, requested: URL, requestId: string, onFailure: () => void): void {
  const target = new URL(upstream);
  target.pathname = requested.pathname;
  target.search = requested.search;
  const headers = Object.fromEntries(Object.entries(request.headers).filter(([name]) => !excluded.has(name)));
  headers['x-request-id'] = requestId;
  const send = target.protocol === 'https:' ? httpsRequest : httpRequest;
  let failureReported = false;
  function fail(): void {
    if (response.writableEnded) return;
    if (!failureReported) {
      failureReported = true;
      onFailure();
    }
    if (response.headersSent) {
      response.destroy();
      return;
    }
    if (!response.writableEnded) {
      response.writeHead(502, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'Upstream unavailable' }));
    }
  }
  const outgoing = send(target, { method: request.method, headers, timeout: 10_000 }, (incoming) => {
    const replyHeaders = Object.fromEntries(Object.entries(incoming.headers).filter(([name]) => !excluded.has(name)));
    replyHeaders['x-request-id'] = requestId;
    response.writeHead(incoming.statusCode ?? 502, replyHeaders);
    incoming.on('error', fail);
    incoming.on('aborted', fail);
    incoming.pipe(response);
  });
  outgoing.on('timeout', () => outgoing.destroy(new Error('Upstream timeout')));
  outgoing.on('error', fail);
  response.on('close', () => { if (!response.writableEnded) outgoing.destroy(); });
  request.pipe(outgoing);
}
