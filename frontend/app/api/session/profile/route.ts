/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Added authenticated profile retrieval through the gateway.
Author review: Pending frontend owner review.
*/
import { NextRequest, NextResponse } from 'next/server';
import { ACCESS, gateway, unavailable } from '@/lib/session-server';

export async function GET(request: NextRequest) {
  const access = request.cookies.get(ACCESS)?.value;
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const upstream = await gateway('/users/me', { headers: { authorization: `Bearer ${access}` } });
    const data: unknown = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch { return unavailable(); }
}
