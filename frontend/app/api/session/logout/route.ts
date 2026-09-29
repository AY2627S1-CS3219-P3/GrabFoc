/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Added logout and local session clearing after remote failure; used shared token rotation to revoke refresh-only sessions on 2026-09-29.
Author review: Pending frontend owner review.
*/
import { NextRequest, NextResponse } from 'next/server';
import { rotateRefreshToken } from '@/lib/protected-gateway';
import { ACCESS, clearSession, forbiddenOrigin, gateway, REFRESH, sameOrigin } from '@/lib/session-server';

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return forbiddenOrigin(request);
  let access = request.cookies.get(ACCESS)?.value;
  let refresh = request.cookies.get(REFRESH)?.value;
  let remoteRevoked = false;
  try {
    if (refresh) {
      if (!access) {
        const outcome = await rotateRefreshToken(refresh);
        if (outcome.kind === 'rotated') {
          access = outcome.tokens.accessToken;
          refresh = outcome.tokens.refreshToken;
        }
      }
      if (access) {
        const upstream = await gateway('/auth/logout', {
          method: 'POST', headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken: refresh }),
        });
        remoteRevoked = upstream.ok;
      }
    }
  } catch { /* Local sign-out still completes; remote revocation is unconfirmed. */ }
  const response = NextResponse.json({ ok: true, remoteRevoked });
  clearSession(response);
  return response;
}
