/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
Scope: Chat message type, chat-ticket fetch and message merging, from the chat plan
Author review: Reviewed by Deanson, 2026-11-09.
*/
'use client';

import { withSessionMutation } from '@/lib/session-client';

/** A saved chat message, as the chat service sends it (the chat plan). */
export type Message = {
  id: number;
  orderId: string;
  senderId: string;
  clientMsgId: string;
  content: string;
  createdAt: string;
};

export type Ack<T> = ({ ok: true } & T) | { ok: false; error: string };

export const PAGE_SIZE = 50;
export const ACK_TIMEOUT_MS = 5000;
export const MAX_CONTENT = 2000;

/** Error messages fetchTicket throws; the chat component decides from them whether to retry. */
export const TRY_AGAIN = 'try again';
export const UNAUTHORIZED = 'unauthorized';
export const NOT_ALLOWED = 'not allowed';

// AI-generated (reviewed by Deanson, 2026-11-09)
/** Asks Order, through the session proxy, for a 10-second chat ticket. */
export async function fetchTicket(orderId: string): Promise<string> {
  let res: Response;
  try {
    res = await withSessionMutation(() =>
      fetch(`/api/session/orders/${orderId}/chat-ticket`, { method: 'POST', cache: 'no-store' }),
    );
  } catch {
    throw new Error(TRY_AGAIN);
  }

  if (res.status === 401) throw new Error(UNAUTHORIZED);
  if ([400, 403, 404].includes(res.status)) throw new Error(NOT_ALLOWED);
  if (!res.ok) throw new Error(TRY_AGAIN); // includes the proxy's 502 and Order's 503
  const data: unknown = await res.json().catch(() => null);
  if (!data || typeof data !== 'object' || !('ticket' in data) || typeof data.ticket !== 'string') throw new Error(TRY_AGAIN);
  return data.ticket;
}

// AI-generated (reviewed by Deanson, 2026-11-09)
/** Merges by id, because a message can arrive more than once (ack, newMessage, catch-up). */
export function mergeMessages(prev: Message[], incoming: Message[]): Message[] {
  if (incoming.length === 0) return prev;

  const lastId = prev.at(-1)?.id ?? 0;
  const inOrder = incoming.every((m, i) => m.id > (i === 0 ? lastId : incoming[i - 1].id));
  if (inOrder) return [...prev, ...incoming];

  const byId = new Map(prev.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}
