/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Added server-side registration verification and session creation.
Author review: Pending frontend owner review.
*/
import { NextRequest, NextResponse } from 'next/server';
import { forbiddenOrigin, gateway, sameOrigin, setSession, unavailable, validTokens } from '@/lib/session-server';

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return forbiddenOrigin();
  try {
    const body = await request.json();
    const upstream = await gateway('/auth/register/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data: unknown = await upstream.json();
    if (!upstream.ok) return NextResponse.json(data, { status: upstream.status });
    if (!validTokens(data)) return unavailable();
    const response = NextResponse.json({ ok: true });
    setSession(response, request, data);
    return response;
  } catch { return unavailable(); }
}
