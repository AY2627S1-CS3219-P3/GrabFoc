/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Routed explicit refresh through the single-use token coordinator; logged rejected origins on 2026-09-29.
Author review: Jie Yang reviewed this file.
*/
import { NextRequest } from 'next/server';
import { refreshSession } from '@/lib/protected-gateway';
import { forbiddenOrigin, sameOrigin } from '@/lib/session-server';

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return forbiddenOrigin(request);
  return refreshSession(request);
}
