/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Added stream-based forwarding to the configured upstream service; stripped caller-supplied identity headers on 2026-09-28.
Author review: Pending gateway owner review.
*/
import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';

const excluded = new Set(['host', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade', 'forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-user-id', 'x-user-role']);

// AI-generated (pending human review)
export function proxy(request: IncomingMessage, response: ServerResponse, upstream: URL): void {
  const target = new URL(request.url ?? '/', upstream);
  const headers = Object.fromEntries(Object.entries(request.headers).filter(([name]) => !excluded.has(name)));
  const send = target.protocol === 'https:' ? httpsRequest : httpRequest;
  const outgoing = send(target, { method: request.method, headers, timeout: 10_000 }, (incoming) => {
    const replyHeaders = Object.fromEntries(Object.entries(incoming.headers).filter(([name]) => !excluded.has(name)));
    response.writeHead(incoming.statusCode ?? 502, replyHeaders);
    incoming.pipe(response);
  });
  outgoing.on('timeout', () => outgoing.destroy(new Error('Upstream timeout')));
  outgoing.on('error', () => {
    if (!response.headersSent) response.writeHead(502, { 'content-type': 'application/json' });
    if (!response.writableEnded) response.end(JSON.stringify({ error: 'Upstream unavailable' }));
  });
  request.pipe(outgoing);
}
