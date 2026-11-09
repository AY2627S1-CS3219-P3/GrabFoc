# AGENTS.md — Chat Service

<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
Scope: Restated the decisions in the team's chat plan and the implemented behaviour.
Author review: Reviewed by Deanson, 2026-11-09.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-09
Scope: Recorded Deanson's 2026-11-09 decisions (ack error string, frontend refusal handling, separate Postman collection), the finished manual testing, and Centralized Logging integration as an open item.
Author review: Reviewed by Deanson, 2026-11-09.
-->

Read the root `AGENTS.md` first.

## Status

_Origin: AI doc_

- Backend done (phase 1): this service, Order's `POST /orders/:orderId/chat-ticket`, the gateway route and CI.
- Frontend done (phase 2): `frontend/app/orders/[id]/order-chat.tsx`, `frontend/lib/chat.ts`, the `chat-ticket` proxy action. Manual testing of both phases done by Deanson (2026-11-09).
- AWS deployment is a follow-up PR after #191.

## Purpose

_Origin: Team (the chat plan)_

One-to-one, real-time chat between an order's requester and courier, with saved messages, shown on the order page. N2H real-time chat, owned by Deanson.

## Rules

_Origin: Team (the chat plan); Restated from root AGENTS.md §8_

- **[Decided]** A separate service with its own PostgreSQL. It never reads Order's database and never calls Order.
- **[Decided]** NestJS gateway + Socket.IO, **WebSocket only** (`transports: ['websocket']`). Keep Socket.IO's default path `/socket.io/` with its trailing slash: gateway routes match it exactly.
- **[Decided]** Access is by **chat ticket** only: HS256, `aud: 'chat'`, `sub` = user ID, `orderId`, 10-second `exp`, signed by Order with `CHAT_TICKET_SECRET`. Never accept the user's JWT; never reuse the JWT signing key.
- The ticket is checked once, in the `server.use` middleware, before the connection is accepted. Handlers trust only `client.data.userId` / `client.data.orderId`, never the message body.
- One room per order: `order:<orderId>`.
- Validate every payload with the strict Zod schemas in `src/chat/chat.schemas.ts`, using `safeParse`, and return `{ ok: false, error }` in the ack. Don't throw `WsException` or use a validation pipe: the error wouldn't reach the ack.
- Save before emitting, and `await` the save. Unexpected failures send no ack.
- Never log message content, tickets or tokens. Refusals log Order's `UNAUTHORISED_ACCESS` line without `status`.
- Schema changes are new numbered files in `migrations/`; never edit an applied one.
- Not wanted (the chat plan): rate limiting, read receipts, typing indicators, online status, an inbox across orders, attachments, Kafka, system messages.
- **Single instance only.** More than one copy would need the Socket.IO Redis adapter.

## Edge cases

_Origin: Team (the chat plan, accepted gaps)_

- A retried `sendMessage` with the same `clientMsgId` returns the original row (unique index on `order_id, sender_id, client_msg_id`) and re-emits it; clients merge by `id`.
- A connection outlives its ticket, its session and the order finishing: tickets are only checked on connect (accepted gaps 2–3).
- A ticket can be reused within its 10 seconds (gap 4).
- `BIGSERIAL` IDs can commit out of order, so catch-up by `afterId` can rarely skip one (gap 6).
- History stays saved after an order finishes, but no new tickets are issued for it (gap 1).

## Design decisions

_Origin: Team (the chat plan; Deanson's 2026-11-09 decisions); AI doc (drafts of the ack error string and frontend refusal handling)_

- **[Decided]** `messages` table as in `migrations/001_init.sql`; no foreign keys (orders and users live elsewhere). `BIGINT` IDs are parsed as numbers (`src/db/database.ts`).
- **[Decided]** Pages of 50: newest first load via `getHistory`, older via `beforeId`, catch-up via `getMissedMessages`.
- **[Open]** The socket refusal's log format, until the logging schema is settled.
- **[Open]** Centralized Logging integration. Chat logs to stdout only. Shipping its lines to the Logging Service's `logging.lines` topic would need a Kafka producer (the chat plan rules Kafka out of chat), event names and fields under the team's still-[Open] line schema (`logging-service/AGENTS.md`), and a decision on `requestId` for socket events, which have no per-message gateway request. To settle with Cole Lin (Logging owner). Recorded as open by Deanson on 2026-11-09.
- **[Decided]** `error` in a failed ack is a short string, `"<field>: <reason>"` (the chat plan only says `{ ok: false, error }`). Drafted by Claude Code; confirmed by Deanson on 2026-11-09.
- **[Decided]** Frontend refusals (refines the chat plan): a 401 while fetching a ticket (the session is gone) goes to `/signin`; if chat refuses a ticket Order issued, the user stays signed in, the chat shows "Chat refused the connection. Reload the page to try again." and doesn't retry. Drafted by Claude Code; confirmed by Deanson on 2026-11-09.
- **[Decided]** Chat has its own Postman collection (`postman/chat.postman_collection.json`, through the gateway), not a folder in Order's. Confirmed by Deanson on 2026-11-09.
