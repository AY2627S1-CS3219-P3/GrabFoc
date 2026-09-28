/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Routed explicit refresh through the shared single-use token coordinator.
Author review: Pending frontend owner review.
*/
import { NextRequest } from 'next/server';
import { refreshSession } from '@/lib/protected-gateway';
import { forbiddenOrigin, sameOrigin } from '@/lib/session-server';

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return forbiddenOrigin();
  return refreshSession(request);
}
