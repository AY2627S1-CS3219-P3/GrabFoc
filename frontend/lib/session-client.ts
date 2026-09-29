/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Serialized cookie-backed BFF requests and session mutations across browser tabs.
Author review: Pending frontend owner review.
*/
'use client';

// AI-generated (pending human review)
export async function withSessionMutation<T>(action: () => Promise<T>): Promise<T> {
  if (!navigator.locks) return action();
  return navigator.locks.request('foc-refresh', action);
}

export async function ensureSession(): Promise<boolean> {
  return withSessionMutation(async () => {
    const response = await fetch('/api/session/status', { cache: 'no-store' });
    if (response.ok) return true;
    if (response.status === 401) return false;
    throw new Error('Session check unavailable');
  });
}

export async function sessionFetch(path: string): Promise<Response> {
  return withSessionMutation(() => fetch(path, { cache: 'no-store' }));
}
