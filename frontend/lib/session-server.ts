/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Added server-only gateway calls and HttpOnly session cookie handling; bounded gateway waits and logged origin rejections on 2026-09-29.
Author review: Jie Yang reviewed this file.
*/
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';

export const ACCESS = 'foc_access';
export const REFRESH = 'foc_refresh';

type Tokens = { accessToken: string; refreshToken: string; expiresIn: number };

export function gatewayUrl(path: string): string {
  const origin = process.env.FRONTEND_GATEWAY_URL ?? 'http://localhost:3003';
  return new URL(path, origin).toString();
}

export async function gateway(path: string, init?: RequestInit): Promise<Response> {
  return fetch(gatewayUrl(path), { ...init, cache: 'no-store', signal: AbortSignal.timeout(10_000) });
}

export function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  return origin === request.nextUrl.origin;
}

// AI-generated (pending human review)
export function sameOriginCookieRead(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (origin) return origin === request.nextUrl.origin;
  return request.headers.get('sec-fetch-site') === 'same-origin';
}

export function logAccessDenial(request: NextRequest, status: 401 | 403): void {
  console.warn(JSON.stringify({ event: 'unauthorized_access', status, method: request.method, path: request.nextUrl.pathname }));
}

export function setSession(response: NextResponse, request: NextRequest, tokens: Tokens): void {
  const common = { httpOnly: true, sameSite: 'lax' as const, secure: request.nextUrl.protocol === 'https:', path: '/' };
  response.cookies.set(ACCESS, tokens.accessToken, { ...common, maxAge: tokens.expiresIn });
  response.cookies.set(REFRESH, tokens.refreshToken, { ...common, maxAge: 90 * 24 * 60 * 60 });
}

export function clearSession(response: NextResponse): void {
  response.cookies.delete(ACCESS);
  response.cookies.delete(REFRESH);
}

export function validTokens(value: unknown): value is Tokens {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return typeof data.accessToken === 'string' && data.accessToken.length > 0 &&
    typeof data.refreshToken === 'string' && data.refreshToken.length > 0 &&
    typeof data.expiresIn === 'number' && data.expiresIn > 0;
}

export function unavailable(): NextResponse {
  return NextResponse.json({ error: { message: 'Gateway unavailable. Please try again.' } }, { status: 502 });
}

export function forbiddenOrigin(request: NextRequest): NextResponse {
  logAccessDenial(request, 403);
  return NextResponse.json({ error: { message: 'Invalid request origin.' } }, { status: 403 });
}
