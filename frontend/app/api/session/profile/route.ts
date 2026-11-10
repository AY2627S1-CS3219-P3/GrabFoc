/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Added authenticated profile retrieval through the server-side refresh and retry helper.
Author review: Jie Yang reviewed this file.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
Scope: Added PATCH, which forwards a strictly validated { displayName } to PATCH /users/me (same-origin only).
Author review: Pending review by Deanson.
*/
import { NextRequest, NextResponse } from 'next/server';
import { protectedGateway } from '@/lib/protected-gateway';
import { forbiddenOrigin, sameOrigin } from '@/lib/session-server';
import { profileEditInput } from '@/lib/session-input';

export async function GET(request: NextRequest) {
  return protectedGateway(request, '/users/me', async (upstream) => {
    const data: unknown = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  });
}

// AI-generated (pending review by Deanson)
export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return forbiddenOrigin(request);
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: { message: 'Invalid profile update.' } }, { status: 400 }); }
  const parsed = profileEditInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { message: 'Invalid profile update.' } }, { status: 400 });
  return protectedGateway(request, '/users/me', async (upstream) => {
    const data: unknown = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  }, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(parsed.data) }, true);
}
