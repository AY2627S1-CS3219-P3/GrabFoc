/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-07
Scope: Added the allowlisted, cookie-backed admin dashboard route, following the Order route (docs/admin-dashboard-plan.md §8.1, #184).
Author review: Reviewed and tested locally by Zi Yi, 2026-11-07.
*/
import { NextRequest, NextResponse } from 'next/server';
import { protectedGateway } from '@/lib/protected-gateway';
import { forbiddenOrigin, sameOrigin } from '@/lib/session-server';

type Context = { params: Promise<{ path: string[] }> };
type Target = { path: string; query: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// AI-generated (reviewed by Zi Yi)
// Only the dashboard's routes (plan §8.1). Role changes and /admin/credits/** are never forwarded.
function adminPath(method: string, segments: string[]): Target | null {
  const [service, first, second, ...rest] = segments;
  if (rest.length > 0 || (service !== 'users' && service !== 'orders')) return null;
  const base = `/admin/${service}`;
  if (first === undefined) return method === 'GET' ? { path: base, query: true } : null;
  if (second === undefined) {
    const named = (service === 'users' && first === 'login-summary') || (service === 'orders' && first === 'overview');
    return named && method === 'GET' ? { path: `${base}/${first}`, query: false } : null;
  }
  if (!UUID.test(first)) return null;
  const path = `${base}/${first}/${second}`;
  if (service === 'users' && second === 'login-events') return method === 'GET' ? { path, query: true } : null;
  if (service === 'users' && (second === 'suspend' || second === 'reactivate')) return method === 'POST' ? { path, query: false } : null;
  if (service === 'orders' && second === 'history') return method === 'GET' ? { path, query: false } : null;
  return null;
}

async function handle(request: NextRequest, context: Context): Promise<NextResponse> {
  if (request.method !== 'GET' && !sameOrigin(request)) return forbiddenOrigin(request);
  const target = adminPath(request.method, (await context.params).path);
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Each service validates its query strictly, so it passes through unchanged.
  const query = target.query ? request.nextUrl.search : '';
  const init: RequestInit = { method: request.method };
  const body = request.method === 'POST' ? await request.text() : '';
  if (body) { init.headers = { 'content-type': 'application/json' }; init.body = body; }
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
