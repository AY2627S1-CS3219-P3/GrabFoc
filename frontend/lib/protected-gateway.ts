/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Added protected requests and in-flight refresh coordination; reused rotation for expired-access logout on 2026-09-29; supported Supplier methods and verified-role display on 2026-09-29.
Author review: Pending frontend owner review and live User Service verification.
*/
import 'server-only';
import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ACCESS, clearSession, forbiddenOrigin, gateway, logAccessDenial, REFRESH, sameOriginCookieRead, setSession, unavailable, validTokens } from '@/lib/session-server';

type Tokens = { accessToken: string; refreshToken: string; expiresIn: number };
type Rotation = { kind: 'rotated'; tokens: Tokens } | { kind: 'unauthorized' } | { kind: 'unavailable' };
type Entry = Promise<Rotation>;
const processState = globalThis as typeof globalThis & { __focRefreshRotations?: Map<string, Entry> };
const rotations = processState.__focRefreshRotations ??= new Map<string, Entry>();

function unauthorized(request: NextRequest, clear: boolean): NextResponse {
  logAccessDenial(request, 401);
  const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (clear) clearSession(response);
  return response;
}

// AI-generated (pending human review)
export async function rotateRefreshToken(refreshToken: string): Promise<Rotation> {
  const key = createHash('sha256').update(refreshToken).digest('hex');
  const existing = rotations.get(key);
  if (existing) return existing;
  const result = (async (): Promise<Rotation> => {
    try {
      const upstream = await gateway('/auth/refresh', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (upstream.status === 401) return { kind: 'unauthorized' };
      if (!upstream.ok) return { kind: 'unavailable' };
      const data: unknown = await upstream.json();
      return validTokens(data) ? { kind: 'rotated', tokens: data } : { kind: 'unavailable' };
    } catch { return { kind: 'unavailable' }; }
  })();
  rotations.set(key, result);
  void result.finally(() => { if (rotations.get(key) === result) rotations.delete(key); });
  return result;
}

export async function refreshSession(request: NextRequest): Promise<NextResponse> {
  const refresh = request.cookies.get(REFRESH)?.value;
  if (!refresh) return unauthorized(request, true);
  const outcome = await rotateRefreshToken(refresh);
  if (outcome.kind === 'unauthorized') return unauthorized(request, true);
  if (outcome.kind === 'unavailable') return unavailable();
  const response = NextResponse.json({ ok: true });
  setSession(response, request, outcome.tokens);
  return response;
}

export async function protectedGateway(
  request: NextRequest,
  path: string,
  toResponse: (upstream: Response, accessToken: string) => Promise<NextResponse>,
  init: RequestInit = {},
): Promise<NextResponse> {
  if (!sameOriginCookieRead(request)) return forbiddenOrigin(request);
  let access = request.cookies.get(ACCESS)?.value;
  const refresh = request.cookies.get(REFRESH)?.value;
  let tokens: Tokens | undefined;
  try {
    const headers = new Headers(init.headers);
    if (access) {
      headers.set('authorization', `Bearer ${access}`);
      const upstream = await gateway(path, { ...init, headers });
      if (upstream.status !== 401) {
        if (upstream.status === 403) logAccessDenial(request, 403);
        return toResponse(upstream, access);
      }
    }
    if (!refresh) return unauthorized(request, true);
    const outcome = await rotateRefreshToken(refresh);
    if (outcome.kind === 'unauthorized') return unauthorized(request, true);
    if (outcome.kind === 'unavailable') return unavailable();
    tokens = outcome.tokens;
    access = tokens.accessToken;
    headers.set('authorization', `Bearer ${access}`);
    const retried = await gateway(path, { ...init, headers });
    if (retried.status === 403) logAccessDenial(request, 403);
    const response = retried.status === 401 ? unauthorized(request, true) : await toResponse(retried, access);
    if (retried.status !== 401) setSession(response, request, tokens);
    return response;
  } catch {
    const response = unavailable();
    if (tokens) setSession(response, request, tokens);
    return response;
  }
}
