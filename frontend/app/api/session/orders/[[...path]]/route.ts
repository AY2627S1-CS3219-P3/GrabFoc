/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Added an allowlisted, cookie-backed Order gateway route, copied from the Supplier route, covering only the endpoints in docs/orders/frontend-integration-plan.md §1.
Author review: Pending review by Deanson.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-07
Scope: Allowed GET /orders/:orderId/history (participants only, checked by the Order Service), so a cancelled order's page can say why (#184).
Author review: Reviewed and tested locally by Zi Yi, 2026-11-07.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
Scope: Allowed POST /orders/:orderId/chat-ticket (the chat plan).
Author review: Reviewed by Deanson, 2026-11-09.
*/
import { NextRequest, NextResponse } from 'next/server';
import { protectedGateway } from '@/lib/protected-gateway';
import { forbiddenOrigin, sameOrigin } from '@/lib/session-server';

type Context = { params: Promise<{ path?: string[] }> };
type Target = { path: string; list: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LISTS = new Set(['available', 'mine', 'assigned']);
// chat-ticket: participants only, checked by the Order Service (the chat plan).
const ACTIONS = new Set(['accept', 'cancel', 'pick-up', 'start-delivery', 'arrive', 'chat-ticket']);

// AI-generated (pending review by Deanson)
// Never forwards /internal/**: only these shapes are allowed.
function orderPath(method: string, segments: string[]): Target | null {
  if (segments.length === 0) return method === 'POST' ? { path: '/orders', list: false } : null;
  const [first, second, third, fourth] = segments;
  if (segments.length === 1 && LISTS.has(first)) return method === 'GET' ? { path: `/orders/${first}`, list: true } : null;
  if (!UUID.test(first)) return null;
  if (segments.length === 1) return method === 'GET' || method === 'PATCH' ? { path: `/orders/${first}`, list: false } : null;
  if (segments.length === 2 && ACTIONS.has(second)) return method === 'POST' ? { path: `/orders/${first}/${second}`, list: false } : null;
  if (segments.length === 2 && second === 'history') return method === 'GET' ? { path: `/orders/${first}/history`, list: false } : null;
  if (segments.length === 2 && second === 'confirmations') {
    return method === 'GET' || method === 'POST' ? { path: `/orders/${first}/confirmations`, list: false } : null;
  }
  if (segments.length === 4 && second === 'confirmations' && UUID.test(third) && fourth === 'respond') {
    return method === 'POST' ? { path: `/orders/${first}/confirmations/${third}/respond`, list: false } : null;
  }
  return null;
}

async function handle(request: NextRequest, context: Context): Promise<NextResponse> {
  if (request.method !== 'GET' && !sameOrigin(request)) return forbiddenOrigin(request);
  const target = orderPath(request.method, (await context.params).path ?? []);
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const query = target.list ? request.nextUrl.search : '';
  const init: RequestInit = { method: request.method };
  if (request.method === 'POST' || request.method === 'PATCH') {
    init.headers = { 'content-type': 'application/json' };
    init.body = await request.text();
  }
  return protectedGateway(request, `${target.path}${query}`, async (upstream) => {
    const contentType = upstream.headers.get('content-type') ?? 'application/json';
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: { 'content-type': contentType, 'cache-control': 'no-store' },
    });
  }, init, true);
}

export async function GET(request: NextRequest, context: Context) { return handle(request, context); }
export async function POST(request: NextRequest, context: Context) { return handle(request, context); }
export async function PATCH(request: NextRequest, context: Context) { return handle(request, context); }
