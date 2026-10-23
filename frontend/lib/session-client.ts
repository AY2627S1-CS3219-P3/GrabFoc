/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Serialized cookie-backed BFF requests and session mutations across browser tabs; exposed the validated session role for location controls on 2026-09-29.
Author review: Jie Yang reviewed this file.

AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Added userId to the session state.
Author review: Pending review by Deanson.
*/
'use client';

// AI-generated (reviewed by Jie Yang)
export async function withSessionMutation<T>(action: () => Promise<T>): Promise<T> {
  if (!navigator.locks) return action();
  return navigator.locks.request('foc-refresh', action);
}

export type SessionState = { authenticated: false } | { authenticated: true; role?: 'ADMIN' | 'USER'; userId?: string };

export async function getSession(): Promise<SessionState> {
  return withSessionMutation(async () => {
    const response = await fetch('/api/session/status', { cache: 'no-store' });
    if (response.status === 401) return { authenticated: false };
    if (!response.ok) throw new Error('Session check unavailable');
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || !('authenticated' in data) || data.authenticated !== true)
      throw new Error('Invalid session response');
    const role = 'role' in data && (data.role === 'ADMIN' || data.role === 'USER') ? data.role : undefined;
    const userId = 'userId' in data && typeof data.userId === 'string' ? data.userId : undefined;
    return { authenticated: true, role, userId };
  });
}

export async function ensureSession(): Promise<boolean> {
  return (await getSession()).authenticated;
}

export async function sessionFetch(path: string): Promise<Response> {
  return withSessionMutation(() => fetch(path, { cache: 'no-store' }));
}
