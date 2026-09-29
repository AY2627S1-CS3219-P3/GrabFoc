/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Added authenticated profile retrieval through the server-side refresh and retry helper.
Author review: Jie Yang reviewed this file.
*/
import { NextRequest, NextResponse } from 'next/server';
import { protectedGateway } from '@/lib/protected-gateway';

export async function GET(request: NextRequest) {
  return protectedGateway(request, '/users/me', async (upstream) => {
    const data: unknown = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  });
}
