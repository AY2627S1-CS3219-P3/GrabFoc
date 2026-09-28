/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Centralized small JSON gateway responses and guarded error responses.
Author review: Pending gateway owner review.
*/
import type { ServerResponse } from 'node:http';

// AI-generated (pending human review)
export function json(response: ServerResponse, status: number, body: object): void {
  if (response.headersSent || response.writableEnded) return;
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}
