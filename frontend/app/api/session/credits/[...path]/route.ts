/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Added an allowlisted, cookie-backed Credit gateway route for the signed-in user's balance and transaction history (#61), following the Supplier route.
Author review: pending — Jie Yang to record the review.
*/
import { NextRequest, NextResponse } from 'next/server';
import { protectedGateway } from '@/lib/protected-gateway';

type Context = { params: Promise<{ path: string[] }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// AI-generated (review pending)
// Only the two read routes; Credit's /internal and /admin routes are never forwarded.
function creditPath(segments: string[]): string | null {
  const [userId, rest] = segments;
  if (!userId || !UUID.test(userId)) return null;
  if (segments.length === 1) return `/credits/${userId}`;
  if (segments.length === 2 && rest === 'transactions') return `/credits/${userId}/transactions`;
  return null;
}

export async function GET(request: NextRequest, context: Context): Promise<NextResponse> {
  const path = creditPath((await context.params).path);
  if (!path) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Credit validates limit and before strictly, so the query is passed through unchanged.
  const query = path.endsWith('/transactions') ? request.nextUrl.search : '';
  return protectedGateway(request, `${path}${query}`, async (upstream) => {
    const contentType = upstream.headers.get('content-type') ?? 'application/json';
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: { 'content-type': contentType, 'cache-control': 'no-store' },
    });
  }, {}, true);
}
