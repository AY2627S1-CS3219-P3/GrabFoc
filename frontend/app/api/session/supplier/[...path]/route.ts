/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-29
Scope: Added an allowlisted, cookie-backed Supplier gateway route for location browsing and management.
Author review: Pending team review and live integration verification.
*/
import { NextRequest, NextResponse } from 'next/server';
import { protectedGateway } from '@/lib/protected-gateway';
import { forbiddenOrigin, sameOrigin } from '@/lib/session-server';

type Context = { params: Promise<{ path: string[] }> };

function supplierPath(method: string, segments: string[]): string | null {
  if (segments.length === 1 && segments[0] === 'location-types' && method === 'GET') return '/location-types';
  if (segments[0] !== 'locations') return null;
  if (segments.length === 1 && (method === 'GET' || method === 'POST')) return '/locations';
  const id = segments[1];
  if (!id || !/^\d+$/.test(id)) return null;
  if (segments.length === 2 && (method === 'GET' || method === 'PATCH')) return `/locations/${id}`;
  if (segments.length === 3 && method === 'POST' &&
    (segments[2] === 'deactivate' || segments[2] === 'restore')) return `/locations/${id}/${segments[2]}`;
  return null;
}

// AI-generated (pending human review)
async function handle(request: NextRequest, context: Context): Promise<NextResponse> {
  if (request.method !== 'GET' && !sameOrigin(request)) return forbiddenOrigin(request);
  const path = supplierPath(request.method, (await context.params).path);
  if (!path) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const query = request.method === 'GET' && path === '/locations' ? request.nextUrl.search : '';
  const init: RequestInit = { method: request.method };
  if ((request.method === 'POST' && path === '/locations') || request.method === 'PATCH') {
    init.headers = { 'content-type': 'application/json' };
    init.body = await request.text();
  }
  return protectedGateway(request, `${path}${query}`, async (upstream) => {
    const contentType = upstream.headers.get('content-type') ?? 'application/json';
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: { 'content-type': contentType, 'cache-control': 'no-store' },
    });
  }, init);
}

export async function GET(request: NextRequest, context: Context) { return handle(request, context); }
export async function POST(request: NextRequest, context: Context) { return handle(request, context); }
export async function PATCH(request: NextRequest, context: Context) { return handle(request, context); }
