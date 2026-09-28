/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Added rotation of the HttpOnly refresh cookie through User Service.
Author review: Pending frontend owner review.
*/
import { NextRequest, NextResponse } from 'next/server';
import { clearSession, forbiddenOrigin, gateway, REFRESH, sameOrigin, setSession, unavailable, validTokens } from '@/lib/session-server';

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return forbiddenOrigin();
  const token = request.cookies.get(REFRESH)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const upstream = await gateway('/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: token }) });
    if (upstream.status === 401) {
      const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      clearSession(response);
      return response;
    }
    if (!upstream.ok) return NextResponse.json({ error: 'Session refresh unavailable' }, { status: upstream.status });
    const data: unknown = await upstream.json();
    if (!validTokens(data)) return unavailable();
    const response = NextResponse.json({ ok: true });
    setSession(response, request, data);
    return response;
  } catch { return unavailable(); }
}
