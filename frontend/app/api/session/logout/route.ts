/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Added User Service logout and local session clearing.
Author review: Pending frontend owner review.
*/
import { NextRequest, NextResponse } from 'next/server';
import { ACCESS, clearSession, forbiddenOrigin, gateway, REFRESH, sameOrigin, unavailable } from '@/lib/session-server';

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return forbiddenOrigin();
  const access = request.cookies.get(ACCESS)?.value;
  const refresh = request.cookies.get(REFRESH)?.value;
  if (!access || !refresh) {
    const response = NextResponse.json({ ok: true });
    clearSession(response);
    return response;
  }
  try {
    const upstream = await gateway('/auth/logout', {
      method: 'POST', headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!upstream.ok) return NextResponse.json({ error: 'Could not log out. Please retry.' }, { status: upstream.status });
    const response = NextResponse.json({ ok: true });
    clearSession(response);
    return response;
  } catch { return unavailable(); }
}
