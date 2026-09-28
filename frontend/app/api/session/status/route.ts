/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Added gateway-backed session status with server-side refresh and retry.
Author review: Pending frontend owner review.
*/
import { NextRequest, NextResponse } from 'next/server';
import { protectedGateway } from '@/lib/protected-gateway';

export async function GET(request: NextRequest) {
  return protectedGateway(request, '/users/me', async (upstream) => {
    if (upstream.ok) return NextResponse.json({ authenticated: true });
    return NextResponse.json({ error: 'Session check unavailable' }, { status: upstream.status });
  });
}
