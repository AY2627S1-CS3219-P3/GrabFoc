<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
Scope: Generated from the team's chat plan and the implemented service.
Author review: Reviewed by Deanson, 2026-11-09.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-09
Scope: Added the Open items section (Centralized Logging).
Author review: Reviewed by Deanson, 2026-11-09.
-->

# Chat Service

One-to-one, real-time chat between an order's requester and courier, with saved messages
(N2H real-time chat). NestJS + Socket.IO over **WebSocket only**, PostgreSQL. Rules for
agents are in [AGENTS.md](AGENTS.md).

Chat never calls Order and never reads its database. Order checks the user and the order, then signs a
10-second **chat ticket**; chat only verifies the ticket.

```text
1. POST /orders/:orderId/chat-ticket (Bearer, through the gateway) → Order → { ticket }
2. WebSocket to the gateway, path /gateway/socket.io/ (or /socket.io/), Socket.IO auth: { ticket }
3. Chat verifies the ticket and joins the socket to room order:<orderId>
```

## Run

From the repo root:

```bash
# once: add a secret of 32+ characters to .env (Order won't start without it either)
echo "CHAT_TICKET_SECRET=$(openssl rand -hex 32)" >> .env
docker compose up -d --build
curl http://localhost:3008/health        # {"status":"ok"}
```

| Container | Does |
|---|---|
| `chat-db` | PostgreSQL 17, volume `chat-db-data`, no host port |
| `chat-migrate` | one-shot: applies `migrations/*.sql`, then exits |
| `chat-service` | port 3007 inside Compose, published on host port **3008** (Logging has 3007) |

Socket addresses:

| Through | URL | Socket.IO path |
|---|---|---|
| Envoy (the normal path) | `http://localhost:3003` | `/gateway/socket.io/` or `/socket.io/` |
| Chat directly (debugging) | `http://localhost:3008` | `/socket.io/` |

## Socket API

Connect with `transports: ['websocket']` and `auth: { ticket }`. A missing, edited, expired or
wrong-audience ticket gets `connect_error` with message `unauthorized`. The ticket is only checked on
connect, so the connection outlives it.

| Direction | Event | Payload | Ack |
|---|---|---|---|
| client → server | `getHistory` | `{}` or `{ beforeId }` | `{ ok: true, messages }`: newest 50, or the 50 before `beforeId`; oldest first |
| client → server | `getMissedMessages` | `{ afterId }` | `{ ok: true, messages }`: up to 50 after `afterId`, oldest first |
| client → server | `sendMessage` | `{ clientMsgId, content }` | `{ ok: true, message }` |
| server → room | `newMessage` | the saved message | sent to the other sockets on the order (not the sender's own socket) |

- A message is `{ id, orderId, senderId, clientMsgId, content, createdAt }`.
- Invalid payloads ack `{ ok: false, error: "<field>: <reason>" }`. Unknown fields are rejected.
- `clientMsgId` 1–64 characters; `content` 1–2,000 characters after trimming (stored trimmed);
  `beforeId` a positive integer; `afterId` an integer ≥ 0.
- Sending the same `clientMsgId` again returns the original message: retries never save twice.
- An unexpected failure (e.g. the database is down) sends **no ack**, so the client times out and retries.

## Manual testing (Postman)

1. Import [postman/chat.postman_collection.json](postman/chat.postman_collection.json). Set
   `emailA`, `emailB`, `emailC` and `password` to three verified accounts. Run folder 0, then folder 1:
   it creates an order, checks the ticket's 403 / 401 / 404 cases, has B accept it, and saves
   `ticketA` and `ticketB`.
2. **New → Socket.IO**. URL `ws://localhost:3003`; Settings: client **v4**, handshake path
   `/gateway/socket.io/`; handshake auth `{"ticket": "<ticketA>"}`. Tickets last 10 seconds: rerun
   "Ticket for A" and connect straight away.
3. Listen for `newMessage`. Emit with **Acknowledgement** on:
   `sendMessage` `{"clientMsgId":"m1","content":"hi"}`, `getHistory` `{}`,
   `getMissedMessages` `{"afterId":0}`.
4. Open a second Socket.IO tab with B's ticket and send from each side.

If your Postman can't send the handshake `auth` payload, use the terminal client instead:

```bash
cd chat-service && npm install
npm run try-chat -- <ticket>                                   # through Envoy
npm run try-chat -- <ticket> http://localhost:3008 /socket.io/  # chat directly
# type a line to send it; /history, /older <id>, /missed <id>, /quit
```

## Test

```bash
cd chat-service
npm ci
npm test            # unit tests (ticket checks)
npm run build

# database and socket tests, against a throwaway PostgreSQL in Docker:
docker compose -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from chat-tests
# or against your own: CHAT_TEST_DATABASE_URL=postgres://…/chat_test npm run test:int
```

CI runs `npm test` and `npm run build` in the service matrix, and `npm run test:int` in the
`chat-integration` job.

## Open items

- **Centralized Logging:** chat logs to stdout only (`docker compose logs chat-service`); it doesn't
  send lines to the Logging Service yet. Open with Cole Lin; details in [AGENTS.md](AGENTS.md)
  (Design decisions).

## Environment

| Variable | Set by | Notes |
|---|---|---|
| `CHAT_TICKET_SECRET` | root `.env` | ≥ 32 characters; Order gets the same value as `ORDER_CHAT_TICKET_SECRET` |
| `CHAT_POSTGRES_PASSWORD` | root `.env` | `chat-db`'s password |
| `CHAT_DATABASE_URL` | Compose | `postgres://foc@chat-db:5432/chat`, password in `PGPASSWORD` |
| `CHAT_PORT` | Compose | default 3007 |
| `CHAT_TEST_DATABASE_URL` | you / CI | database name must end in `_test` |
