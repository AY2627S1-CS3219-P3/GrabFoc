/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Added gateway-backed session status with server-side refresh and retry; exposed the validated access token role for frontend controls on 2026-09-29.
Author review: Jie Yang reviewed this file.

AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Also returns the token's sub claim as userId, for the order page's "viewing as" label (approved by Deanson, 2026-10-22).
Author review: Pending review by Deanson.
*/
import { NextRequest, NextResponse } from 'next/server';
import { protectedGateway } from '@/lib/protected-gateway';

export async function GET(request: NextRequest) {
  return protectedGateway(request, '/users/me', async (upstream, accessToken) => {
    if (upstream.ok) {
      const payload = accessToken.split('.')[1];
      let role: 'ADMIN' | 'USER' | undefined;
      let userId: string | undefined;
      try {
        const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (claims && typeof claims === 'object' && 'role' in claims &&
          (claims.role === 'ADMIN' || claims.role === 'USER')) role = claims.role;
        // AI-generated (pending review by Deanson)
        if (claims && typeof claims === 'object' && 'sub' in claims && typeof claims.sub === 'string') userId = claims.sub;
      } catch { /* User Service already verified the token; malformed test tokens have no role. */ }
      return NextResponse.json({ authenticated: true, role, userId });
    }
    return NextResponse.json({ error: 'Session check unavailable' }, { status: upstream.status });
  });
}
