/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Moved implemented Supplier Service route definitions out of the gateway request handler.
Author review: Pending gateway owner review.
*/
import type { GatewayRoute } from './types.js';

function escape(path: string): string {
  return path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// AI-generated (pending human review)
export function supplierRoutes(locationsPrefix: string): GatewayRoute[] {
  const root = escape(locationsPrefix);
  const location = `${root}/[^/]+`;
  return [
    { method: 'GET', pattern: /^\/location-types$/, service: 'supplier', auth: 'authenticated' },
    { method: 'GET', pattern: new RegExp(`^${root}$`), service: 'supplier', auth: 'authenticated' },
    { method: 'POST', pattern: new RegExp(`^${root}$`), service: 'supplier', auth: 'authenticated' },
    { method: 'GET', pattern: new RegExp(`^${location}$`), service: 'supplier', auth: 'authenticated' },
    { method: 'PATCH', pattern: new RegExp(`^${location}$`), service: 'supplier', auth: 'authenticated' },
    { method: 'POST', pattern: new RegExp(`^${location}/deactivate$`), service: 'supplier', auth: 'authenticated' },
    { method: 'POST', pattern: new RegExp(`^${location}/restore$`), service: 'supplier', auth: 'authenticated' },
  ];
}
