/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Added gateway-backed session status without exposing tokens to the browser.
Author review: Pending frontend owner review.
*/
import { NextRequest, NextResponse } from 'next/server';
import { ACCESS, gateway, REFRESH, unavailable } from '@/lib/session-server';

export async function GET(request: NextRequest) {
  const access = request.cookies.get(ACCESS)?.value;
  const refresh = request.cookies.get(REFRESH)?.value;
  if (!access) return NextResponse.json({ authenticated: false }, { status: refresh ? 428 : 401 });
  try {
    const upstream = await gateway('/users/me', { headers: { authorization: `Bearer ${access}` } });
    if (upstream.ok) return NextResponse.json({ authenticated: true });
    if (upstream.status === 401) return NextResponse.json({ authenticated: false }, { status: refresh ? 428 : 401 });
    return unavailable();
  } catch { return unavailable(); }
}
