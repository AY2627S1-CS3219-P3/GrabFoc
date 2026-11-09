/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
Scope: Real-time chat on the order page: ticket-authenticated Socket.IO connection, history, older pages on scroll, catch-up after reconnect, sending with retry on the same clientMsgId (the chat plan).
Author review: Reviewed by Deanson, 2026-11-09.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-09
Scope: Redesign: status data attribute for the styles, empty-state art and copy, send icon.
Author review: Pending review by Jie Yang.
*/
"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { EmptyArt, SendIcon } from "@/app/components/icons";
import { formatTime } from "@/lib/orders";
import { ACK_TIMEOUT_MS, type Ack, fetchTicket, MAX_CONTENT, type Message, mergeMessages, NOT_ALLOWED, PAGE_SIZE,
  TRY_AGAIN, UNAUTHORIZED } from "@/lib/chat";

type Status = "connecting" | "connected" | "reconnecting" | "unavailable" | "not-allowed" | "refused";
type Pending = { clientMsgId: string; content: string; state: "sending" | "failed" | "rejected"; error?: string };
type Messages = Ack<{ messages: Message[] }>;

const STATUS_TEXT: Record<Status, string> = {
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  unavailable: "Chat is unavailable. Retrying…",
  "not-allowed": "You can't use this chat.",
  refused: "Chat refused the connection. Reload the page to try again.",
};
const MAX_RETRY_MS = 30_000;
const NEAR_EDGE_PX = 80;

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

// AI-generated (reviewed by Deanson, 2026-11-09)
export function OrderChat({ orderId, userId, socketUrl, socketPath }:
  { orderId: string; userId: string; socketUrl?: string; socketPath: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [status, setStatus] = useState<Status>("connecting");
  const [history, setHistory] = useState<"loading" | "ready" | "failed">("loading");
  const [hasOlder, setHasOlder] = useState(false);
  const [draft, setDraft] = useState("");

  const socketRef = useRef<Socket | null>(null);
  // Newest message from the first load or catch-up. Only those two move it; live messages never do (the chat plan).
  const syncedId = useRef<number | null>(null);
  const oldestId = useRef<number | null>(null);
  const loadingOlder = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const heightBeforeOlder = useRef<number | null>(null);

  const addMessages = useCallback((incoming: Message[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => mergeMessages(prev, incoming));
    // A message can arrive by another route (catch-up after a lost ack), so drop its pending bubble too.
    const ids = new Set(incoming.map((m) => m.clientMsgId));
    setPending((prev) => prev.filter((p) => !ids.has(p.clientMsgId)));
  }, []);

  const loadHistory = useCallback(async (socket: Socket) => {
    setHistory("loading");
    try {
      const res: Messages = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck("getHistory", {});
      if (!res.ok) throw new Error(res.error);
      if (res.messages.length) oldestId.current = res.messages[0].id;
      // Always set, using 0 for an empty chat, or a reconnect would skip what was sent meanwhile.
      syncedId.current ??= res.messages.at(-1)?.id ?? 0;
      setHasOlder(res.messages.length === PAGE_SIZE);
      addMessages(res.messages);
      setHistory("ready");
    } catch {
      setHistory("failed");
    }
  }, [addMessages]);

  const catchUp = useCallback(async (socket: Socket) => {
    try {
      for (;;) {
        const res: Messages = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck("getMissedMessages", { afterId: syncedId.current });
        if (!res.ok) throw new Error(res.error);
        const last = res.messages.at(-1);
        if (last) syncedId.current = last.id;
        addMessages(res.messages);
        if (res.messages.length < PAGE_SIZE) break;
      }
      setHistory("ready");
    } catch {
      setHistory("failed");
    }
  }, [addMessages]);

  useEffect(() => {
    let ticketError: string | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 1000;

    const options = {
      path: socketPath,
      transports: ["websocket"],
      // Called on every attempt, so each reconnect gets a fresh 10-second ticket. Must stay a function.
      auth: (cb: (data: object) => void) => {
        fetchTicket(orderId).then(
          (ticket) => { ticketError = null; cb({ ticket }); },
          (err: Error) => { ticketError = err.message; cb({}); },
        );
      },
    };
    const socket = socketUrl ? io(socketUrl, options) : io(options);
    socketRef.current = socket;

    socket.on("connect", () => {
      retryDelay = 1000;
      setStatus("connected");
      void (syncedId.current === null ? loadHistory(socket) : catchUp(socket));
    });
    socket.on("disconnect", () => setStatus("reconnecting"));
    socket.on("newMessage", (message: Message) => addMessages([message]));
    socket.on("connect_error", (err) => {
      const reason = ticketError ?? err.message;
      if (socket.active) { setStatus("reconnecting"); return; } // Socket.IO is already retrying
      // Chat's middleware refused: Socket.IO won't retry by itself.
      if (reason === TRY_AGAIN) {
        setStatus("unavailable");
        retryTimer = setTimeout(() => socket.connect(), retryDelay);
        retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
      } else if (ticketError === UNAUTHORIZED) {
        router.replace("/signin"); // the session itself is gone
      } else {
        setStatus(reason === NOT_ALLOWED ? "not-allowed" : "refused");
      }
    });

    return () => {
      clearTimeout(retryTimer);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [orderId, socketUrl, socketPath, router, addMessages, loadHistory, catchUp]);

  // Keep the view still when older messages are added above; follow new ones only when at the bottom.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (heightBeforeOlder.current !== null) {
      list.scrollTop += list.scrollHeight - heightBeforeOlder.current;
      heightBeforeOlder.current = null;
    } else if (nearBottom.current) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages, pending]);

  async function loadOlder() {
    const socket = socketRef.current;
    if (!socket || loadingOlder.current || !hasOlder || oldestId.current === null) return;
    loadingOlder.current = true;
    try {
      const res: Messages = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck("getHistory", { beforeId: oldestId.current });
      if (!res.ok) return;
      if (res.messages.length) {
        oldestId.current = res.messages[0].id;
        heightBeforeOlder.current = listRef.current?.scrollHeight ?? null;
      }
      setHasOlder(res.messages.length === PAGE_SIZE);
      addMessages(res.messages);
    } catch {
      // Timed out: scrolling to the top again retries.
    } finally {
      loadingOlder.current = false;
    }
  }

  function onScroll() {
    const list = listRef.current;
    if (!list) return;
    nearBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < NEAR_EDGE_PX;
    if (list.scrollTop < NEAR_EDGE_PX) void loadOlder();
  }

  function send(clientMsgId: string, content: string) {
    const socket = socketRef.current;
    if (!socket) return;
    nearBottom.current = true;
    setPending((prev) => [...prev.filter((p) => p.clientMsgId !== clientMsgId), { clientMsgId, content, state: "sending" }]);
    const mark = (state: Pending["state"], error?: string) =>
      setPending((prev) => prev.map((p) => p.clientMsgId === clientMsgId ? { ...p, state, error } : p));
    socket.timeout(ACK_TIMEOUT_MS).emitWithAck("sendMessage", { clientMsgId, content }).then(
      // The sender gets no newMessage, so the ack is its only copy.
      (res: Ack<{ message: Message }>) => res.ok ? addMessages([res.message]) : mark("rejected", res.error),
      () => mark("failed"), // Retry must reuse this clientMsgId, so the message can't be saved twice
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || content.length > MAX_CONTENT || status !== "connected") return;
    send(crypto.randomUUID(), content);
    setDraft("");
  }

  const connected = status === "connected";
  const trimmed = draft.trim().length;

  return <div className="chat" data-status={status}>
    <p className={`chat-status${connected ? " chat-status--live" : ""}`} role="status">{STATUS_TEXT[status]}</p>
    <div className="chat-log" ref={listRef} onScroll={onScroll} role="log" aria-live="polite" aria-label="Messages">
      {hasOlder && <p className="chat-note">Scroll up for older messages</p>}
      {history === "loading" && messages.length === 0 && <p className="chat-note">Loading messages…</p>}
      {history === "failed" && <p className="chat-note" role="alert">Couldn&apos;t load messages.{" "}
        <button type="button" className="text-button" disabled={!connected}
          onClick={() => { const s = socketRef.current; if (s) void (syncedId.current === null ? loadHistory(s) : catchUp(s)); }}>
          Retry</button></p>}
      {history === "ready" && messages.length === 0 && pending.length === 0 && <div className="chat-empty"><EmptyArt kind="chat" />
        <p className="chat-note">No messages yet. Say hello to sort out the handover.</p></div>}
      {messages.map((m) => <div key={m.id} className={`chat-bubble${m.senderId === userId ? " chat-bubble--own" : ""}`}>
        <p>{m.content}</p>
        <time dateTime={m.createdAt} title={formatTime(m.createdAt)}>{timeOf(m.createdAt)}</time>
      </div>)}
      {pending.map((p) => <div key={p.clientMsgId} className={`chat-bubble chat-bubble--own chat-bubble--${p.state}`}>
        <p>{p.content}</p>
        {p.state === "sending" && <span>Sending…</span>}
        {p.state === "failed" && <span>Not sent.{" "}
          <button type="button" className="chat-inline" disabled={!connected} onClick={() => send(p.clientMsgId, p.content)}>Retry</button></span>}
        {p.state === "rejected" && <span>{p.error}{" "}
          <button type="button" className="chat-inline"
            onClick={() => setPending((prev) => prev.filter((x) => x.clientMsgId !== p.clientMsgId))}>Dismiss</button></span>}
      </div>)}
    </div>
    <form className="chat-form" onSubmit={submit}>
      <label className="sr-only" htmlFor="chat-input">Message</label>
      <input id="chat-input" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={MAX_CONTENT}
        placeholder={connected ? "Type a message" : "Waiting for connection…"} autoComplete="off" />
      <button type="submit" className="primary-button" disabled={!connected || trimmed === 0 || trimmed > MAX_CONTENT}><SendIcon size={16} />Send</button>
    </form>
  </div>;
}
