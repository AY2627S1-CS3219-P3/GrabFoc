/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Added browser session checks and serialized refresh and session mutation for single-use tokens.
Author review: Pending frontend owner review.
*/
'use client';

let pendingRefresh: Promise<boolean> | undefined;

// AI-generated (pending human review)
export async function withSessionMutation<T>(action: () => Promise<T>): Promise<T> {
  if (!navigator.locks) return action();
  return navigator.locks.request('foc-refresh', action);
}

async function status(): Promise<'authenticated' | 'refresh' | 'signed-out'> {
  const response = await fetch('/api/session/status', { cache: 'no-store' });
  if (response.ok) return 'authenticated';
  if (response.status === 401) return 'signed-out';
  if (response.status === 428) return 'refresh';
  throw new Error('Session check unavailable');
}

async function refreshOnce(): Promise<boolean> {
  const current = await status();
  if (current === 'authenticated') return true;
  if (current === 'signed-out') return false;
  const response = await fetch('/api/session/refresh', { method: 'POST' });
  if (response.status === 401) return false;
  if (!response.ok) throw new Error('Session refresh unavailable');
  return true;
}

export async function ensureSession(): Promise<boolean> {
  const current = await status();
  if (current === 'authenticated') return true;
  if (current === 'signed-out') return false;
  if (!pendingRefresh) {
    const run = async () => {
      if (!navigator.locks) throw new Error('This browser cannot coordinate session refresh across tabs');
      return withSessionMutation(refreshOnce);
    };
    pendingRefresh = run().finally(() => { pendingRefresh = undefined; });
  }
  return pendingRefresh;
}

export async function sessionFetch(path: string): Promise<Response> {
  if (!await ensureSession()) return new Response(null, { status: 401 });
  let response = await fetch(path, { cache: 'no-store' });
  if (response.status === 401 && await ensureSession()) response = await fetch(path, { cache: 'no-store' });
  return response;
}
