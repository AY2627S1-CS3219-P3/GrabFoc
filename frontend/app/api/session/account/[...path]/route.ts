/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
Scope: Added the allowlisted, cookie-backed proxy for the six OTP-protected /users/me routes, following the admin route. Deanson approved this interface in the plan.
Author review: Pending review by Deanson.
*/
import { NextRequest, NextResponse } from 'next/server';
import { protectedGateway } from '@/lib/protected-gateway';
import { forbiddenOrigin, sameOrigin } from '@/lib/session-server';

type Context = { params: Promise<{ path: string[] }> };

// AI-generated (pending review by Deanson)
const ALLOWED = new Set(['POST otp', 'POST email', 'POST email/verify', 'PATCH mobile', 'POST password', 'POST deactivate']);

async function handle(request: NextRequest, context: Context): Promise<NextResponse> {
  if (!sameOrigin(request)) return forbiddenOrigin(request);
  const path = (await context.params).path.join('/');
  if (!ALLOWED.has(`${request.method} ${path}`)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const init: RequestInit = { method: request.method, headers: { 'content-type': 'application/json' }, body: await request.text() };
  return protectedGateway(request, `/users/me/${path}`, async (upstream) => {
    const contentType = upstream.headers.get('content-type') ?? 'application/json';
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: { 'content-type': contentType, 'cache-control': 'no-store' },
    });
  }, init, true);
}

export async function POST(request: NextRequest, context: Context) { return handle(request, context); }
export async function PATCH(request: NextRequest, context: Context) { return handle(request, context); }
