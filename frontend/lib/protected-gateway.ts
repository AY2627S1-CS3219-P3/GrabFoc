/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Added server-side protected requests with one refresh and one retry, coordinated for single-use refresh tokens.
Author review: Pending frontend owner review and live User Service verification.
*/
import 'server-only';
import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ACCESS, clearSession, gateway, REFRESH, setSession, unavailable, validTokens } from '@/lib/session-server';

type Tokens = { accessToken: string; refreshToken: string; expiresIn: number };
type Rotation = { kind: 'rotated'; tokens: Tokens } | { kind: 'unauthorized' } | { kind: 'unavailable' };
type Entry = { result: Promise<Rotation>; expiresAt?: number };
const processState = globalThis as typeof globalThis & { __focRefreshRotations?: Map<string, Entry> };
const rotations = processState.__focRefreshRotations ??= new Map<string, Entry>();
const REPLAY_WINDOW_MS = 10_000;

function unauthorized(request: NextRequest, clear: boolean): NextResponse {
  console.warn(JSON.stringify({ event: 'unauthorized_access', status: 401, method: request.method, path: request.nextUrl.pathname }));
  const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (clear) clearSession(response);
  return response;
}

// AI-generated (pending human review)
async function rotate(refreshToken: string): Promise<Rotation> {
  const key = createHash('sha256').update(refreshToken).digest('hex');
  const existing = rotations.get(key);
  if (existing && (existing.expiresAt === undefined || existing.expiresAt > Date.now())) return existing.result;
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
  const entry: Entry = { result };
  rotations.set(key, entry);
  void result.then((outcome) => {
    if (rotations.get(key) !== entry) return;
    if (outcome.kind !== 'rotated') { rotations.delete(key); return; }
    entry.expiresAt = Date.now() + REPLAY_WINDOW_MS;
    setTimeout(() => { if (rotations.get(key) === entry) rotations.delete(key); }, REPLAY_WINDOW_MS).unref();
  });
  return result;
}

export async function refreshSession(request: NextRequest): Promise<NextResponse> {
  const refresh = request.cookies.get(REFRESH)?.value;
  if (!refresh) return unauthorized(request, true);
  const outcome = await rotate(refresh);
  if (outcome.kind === 'unauthorized') return unauthorized(request, true);
  if (outcome.kind === 'unavailable') return unavailable();
  const response = NextResponse.json({ ok: true });
  setSession(response, request, outcome.tokens);
  return response;
}

export async function protectedGateway(
  request: NextRequest,
  path: string,
  toResponse: (upstream: Response) => Promise<NextResponse>,
): Promise<NextResponse> {
  let access = request.cookies.get(ACCESS)?.value;
  const refresh = request.cookies.get(REFRESH)?.value;
  let tokens: Tokens | undefined;
  try {
    if (access) {
      const upstream = await gateway(path, { headers: { authorization: `Bearer ${access}` } });
      if (upstream.status !== 401) return toResponse(upstream);
    }
    if (!refresh) return unauthorized(request, true);
    const outcome = await rotate(refresh);
    if (outcome.kind === 'unauthorized') return unauthorized(request, true);
    if (outcome.kind === 'unavailable') return unavailable();
    tokens = outcome.tokens;
    access = tokens.accessToken;
    const retried = await gateway(path, { headers: { authorization: `Bearer ${access}` } });
    const response = retried.status === 401 ? unauthorized(request, true) : await toResponse(retried);
    if (retried.status !== 401) setSession(response, request, tokens);
    return response;
  } catch { return unavailable(); }
}
