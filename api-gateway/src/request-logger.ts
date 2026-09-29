/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Added request IDs and structured completion and failure logging without sensitive data.
Author review: Jie Yang reviewed this file.
*/
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { performance } from 'node:perf_hooks';
import type { ServiceName } from './routing/types.js';

function safeRequestId(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && /^[A-Za-z0-9._:-]{1,128}$/.test(candidate) ? candidate : randomUUID();
}

// AI-generated (reviewed by Jie Yang)
export function beginRequest(request: IncomingMessage, response: ServerResponse, details: () => { path: string; service?: ServiceName }) {
  const requestId = safeRequestId(request.headers['x-request-id']);
  const startedAt = performance.now();
  response.setHeader('x-request-id', requestId);
  response.once('finish', () => {
    const { path, service } = details();
    console.log(JSON.stringify({
      event: 'request_completed', requestId, method: request.method, path,
      service: service ?? null, status: response.statusCode,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    }));
  });
  return requestId;
}

export function logFailure(event: 'unauthorized_access' | 'authentication_unavailable' | 'upstream_failure' | 'gateway_error', requestId: string, method: string | undefined, path: string, service?: ServiceName): void {
  console.warn(JSON.stringify({ event, requestId, method, path, service: service ?? null }));
}
