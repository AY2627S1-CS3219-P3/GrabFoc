<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
Scope: Wrote this spec from Jian Bing's design decisions (made in a learning-mode brainstorming
       session) and the additions Claude Code proposed and he confirmed as proposals.
Author review: Jian Bing, 2026-10-18 — read in full; it matches what I decided.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
Scope: Added §9 (Kafka design for Phases 2–3) from Jian Bing's decisions in a learning-mode
       session, with Claude Code's proposals labelled. 2026-10-15: updated §3, §8 and §9 with his
       walkthrough decisions (K5–K13). 2026-10-16: K10 revised (retry topics listed in topics.txt).
Author review: Jian Bing, 2026-10-18 — read in full; it matches what I decided.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
Scope: Wrote the 2026-10-18 Author review text above from Jian Bing's account of what he checked (PR #97).
Author review: Jian Bing supplied what it states; the wording is Claude's.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
Scope: Added the transaction history route to §3 and §4.4 (route, paging and limits decided by Jian Bing).
Author review: pending — Jian Bing to record what he checked.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
Scope: Dead-letter table columns renamed to a generic envelope (message_key, message_type).
Author review: pending — Jian Bing to record what he checked.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
Scope: Recorded the team consensus on transfer/release as commands and the removal of their HTTP routes.
Author review: pending — Jian Bing to record what he checked.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: §4.3 and the Phase 3 row now say the HTTP routes are already removed (PR #94 review).
Author review: pending — Jian Bing to record what he checked.
-->

# Credit Service redesign: wallets from events, async transfer/release, balance read

**Status:** draft for review · **Date:** 2026-10-14 · **Author:** Jian Bing
**Builds on:** PR #48 (first Credit Service: synchronous reserve / transfer / release)

**Who decides what.** Credit Service is owned by **Zi Yi** (Gantt). Everything here is
**[Proposed]** until Zi Yi agrees. Parts touching other services need their owners too:
`UserRegistered` (User Service: Deanson, Zi Yi), the transfer/release commands and Order's outbox
(Order Service: Jian Bing, Jie Yang), the gateway route (Jie Yang), and the broker choice (team).

Labels used below, following root `AGENTS.md`:
- **Decision (Jian Bing):** chosen by Jian Bing in the design session.
- **Proposed (AI):** suggested by Claude Code, confirmed by Jian Bing *as a proposal* for the owners.

## 1. Why

1. **New users see no balance.** Today Credit creates a wallet the first time a user reserves or
   receives credits, so the profile page has nothing to show a user who hasn't ordered yet.
2. **Order and Credit must stay in their own scopes** (the lecturer's warning). Credit moves
   credits; every rule about orders (how many, who may change what) belongs to Order.
3. **Order shouldn't wait on Credit when it doesn't need an answer.** Paying the courier and
   refunding the requester don't have to block Order.

## 2. Decisions

| # | Decision (Jian Bing) |
|---|---|
| D1 | **Scope.** Credit reserves, transfers, releases and reports balances. It holds no rules about orders: no limit on a requester's open orders, no courier rules, no offer changes. |
| D2 | **Hybrid communication.** Reserve stays **synchronous HTTP** at order creation, so Order knows at once whether the order is funded and no new order state is needed. If Credit is down, order creation fails and nothing else does. **Transfer and release become asynchronous commands.** |
| D3 | **One-way dependency.** Order → Credit only. Credit never consumes Order's events or knows order states. |
| D4 | **Order id stays the hold key**, treated by Credit as an opaque reference supplied by the caller. |
| D5 | **No credit-offer updates.** Backlog O1.3.3 stays; to change the offer, cancel and recreate. |
| D6 | **Wallets come only from User Service's `UserRegistered` event**, including for the bootstrap admin (the bootstrap publishes it too). **No lazy creation**: one path defines how a wallet comes to exist. |
| D7 | **Reserve with no wallet fails** synchronously; Order does not create the order. |
| D8 | **Transfer with no courier wallet**: retry with backoff, then dead-letter queue, alert, manual fix and replay. A wallet that never appears means a bug or a lost event, which must be investigated, not hidden. |
| D9 | **Balance read**: `/:userId` style. A USER reads only their own balance (403 otherwise); an ADMIN reads anyone's. Returns `userId`, `available`, `reserved`. **404** when there is no wallet yet; the frontend shows "Setting up…" and fetches again. |
| D10 | **Existing local data is purged** (`docker compose down -v`) rather than migrated: there are no real users and no cloud deployment yet. |

Rejected along the way (Jian Bing): fully asynchronous creation with an `AWAITING_CREDIT` order
state (more state, a backlog change and polling UI for little gain); Credit consuming Order's
events (two-way coupling alongside the synchronous reserve); a `CreateWallet` command from User
Service (User → Credit coupling, no reliability gain); creating wallets lazily, with or without a
User Service existence check (a second way wallets appear, or a Credit → User dependency).

## 3. Messages

| Message | From → to | Transport | Payload | Proposed (AI) |
|---|---|---|---|---|
| Reserve | Order → Credit | HTTP `POST /internal/credits/reserve` (unchanged) | `{orderId, requesterId, amount}` | |
| `TransferCredits` | Order → Credit | broker command on `credit.commands` | `{type, eventId, orderId, courierId}` | ✓ |
| `ReleaseCredits` | Order → Credit | broker command on `credit.commands` | `{type, eventId, orderId}` | ✓ |
| `UserRegistered` | User → Credit (and anyone else) | broker event on `user.events` | Defined by the User Service (K6); suggested `{type, eventId, userId, occurredAt}` | ✓ |
| Balance read | Frontend → gateway → Credit | HTTP `GET /credits/:userId` | — | ✓ |
| Transaction history | Frontend → gateway → Credit | HTTP `GET /credits/:userId/transactions` | — | |

**Broker layout:** one Kafka broker shared by all services (K1). **Events go to the publisher's
topic; commands go to the receiver's topic** (K5): `user.events` and later `order.events` are
written by their owners, while Order writes to Credit's `credit.commands`. The topic's owner defines
its message shape (K6). The rules for every service are in root `AGENTS.md` §3 "Messaging".

Credit publishes nothing in this design. Reserve's result is the HTTP response. Whether Order
publishes `OrderCreated` (root `AGENTS.md` §10) is Order's decision; if it does, it should be after
the reserve succeeds, so couriers only see funded orders.

## 4. Credit Service changes

### 4.1 Wallet creation (D6)

- New consumer for `UserRegistered`: `INSERT INTO credit_accounts (user_id) VALUES ($1) ON CONFLICT DO NOTHING`.
  A redelivered or duplicated event changes nothing; the starting 10 credits come from the
  column default, so they can't be granted twice.
- **Remove** the lazy `ensureAccount` from reserve and transfer.

### 4.2 Reserve (D2, D7)

Unchanged except: no wallet → reply **409** with code `WALLET_NOT_FOUND` (Proposed, AI) and
store nothing.

### 4.3 Transfer and release as commands (D2, D8)

- A consumer on `credit.commands` calls the **same** transfer/release logic as today. The HTTP
  routes for transfer and release were removed on 2026-10-18, before Order existed (§9.3).
- **Duplicates** are already harmless: the per-order state check (`WHERE state = 'RESERVED'`)
  makes a repeat a no-op. `eventId` is for tracing, not deduplication.
- **Retry policy (Proposed, AI):** a command that can't be applied *yet* (courier wallet missing)
  is retried 5 times, after 1 s, 5 s, 30 s, 2 min and 10 min, then moved to the
  dead-letter queue and logged at `error` as `credit_command_dead_lettered` with the event id and
  order id, never balances (NFR5.1).
- **Release with no hold** also goes to the dead-letter queue: with a synchronous reserve, Order
  never releases an order that wasn't reserved, so this is a bug.
- A conflict that will never succeed (transfer after release, a different courier) is dead-lettered
  immediately rather than retried.
- The message is acknowledged only after the database transaction commits, so a crash mid-way
  redelivers it instead of losing it.

### 4.4 Balance read (D9)

- `GET /credits/:userId`, routed by the gateway with the user's JWT. Credit verifies the JWT
  itself against the User Service JWKS, as the Supplier Service does (root `AGENTS.md` §6, §8).
  **(Proposed, AI)**
- The path names *whose* balance; the token says *who is asking*. USER with a different id → 403,
  logged as `access_denied`. ADMIN → any id.
- 200 `{userId, available, reserved}`; 404 `WALLET_NOT_FOUND` when no wallet exists. Never creates a wallet.
- `/internal/**` stays unreachable through the gateway.
- **Transaction history** (decided by Jian Bing, 2026-10-18): `GET /credits/:userId/transactions`,
  with the same access rule. Rows from `credit_transactions`, newest first; `limit` 1–100 (default
  20) and a `before=<id>` cursor. 200 `{items: [{id, orderId, type, availableChange,
  reservedChange, createdAt}], nextBefore}` (`null` on the last page); 404 `WALLET_NOT_FOUND`.

### 4.5 Error codes (Proposed, AI)

Problem Details bodies gain a machine-readable `code`: `INSUFFICIENT_CREDITS`,
`WALLET_NOT_FOUND`, `HOLD_MISMATCH`, `ALREADY_TRANSFERRED`, `ALREADY_RELEASED`,
`COURIER_IS_REQUESTER`, `HOLD_NOT_FOUND`. Order needs to tell "no wallet yet" from "not enough
credits" to show the right message.

### 4.6 Schema

No table changes. `credit_accounts` and `credit_holds` stay as in PR #48.

## 5. Changes needed in other services (their owners decide)

| Service | Change |
|---|---|
| User | Publish `UserRegistered` through a transactional outbox, written in the same transaction as the user insert in `/auth/register/verify` **and** in the admin bootstrap (already planned as "Deferred" in `user-service/AGENTS.md`). |
| Order | Call reserve over HTTP at creation; send `TransferCredits` / `ReleaseCredits` through an outbox written with the order's state change; keep all Credit calls behind one "credit client" module; on `WALLET_NOT_FOUND` tell the user their credits are still being set up. |
| Gateway | Route `GET /credits/**` to Credit with JWT authentication; keep `/internal/**` blocked. |
| Frontend | Show the balance on the profile page; on 404 show "Setting up…" and fetch again with a short backoff (about 1 s, 2 s, 4 s) and when the tab regains focus. |

## 6. Phasing

Removing lazy creation before the `UserRegistered` consumer exists would leave nobody with a
wallet, so the order matters.

| Phase | Work | Needs |
|---|---|---|
| 1 (D3, Credit only) | Balance read endpoint with JWT auth; error codes; gateway route | Gateway owner for the route |
| 2 | Broker in compose; `UserRegistered` consumer; then remove lazy creation; purge local data | Team's broker choice; User Service outbox |
| 3 | Transfer/release consumers with retries and DLQ; remove the HTTP transfer/release routes (done early, §9.3) | Order Service outbox and credit client (not for the removal) |

## 7. Testing

- **Phase 1:** unit tests for the access rule (own id, other id → 403, admin → any id, no token →
  401); integration tests for 200 / 404 against PostgreSQL; the Postman collection gains the
  balance requests.
- **Phase 2:** a duplicated `UserRegistered` creates one wallet with 10 credits; reserve with no
  wallet → 409 `WALLET_NOT_FOUND` and nothing stored.
- **Phase 3:** a duplicated transfer command moves credits once; a transfer whose courier wallet
  appears during the retries succeeds; one whose wallet never appears lands in the DLQ with the
  `credit_command_dead_lettered` log; a crash before commit redelivers the command.

## 8. Open items

- Broker choice: **Kafka**, chosen by Jian Bing and Jie Yang (§9). Confirm with the rest of the team,
  then record it in root `AGENTS.md` §3.
- Transfer/release via the broker: **agreed by the team on 2026-10-18** and recorded in root `AGENTS.md` §3.
  Still worth telling the mentor, since it changed a [Decided] item. (Originally: confirm with the mentor that moving transfer/release to the broker changes the [Decided]
  "synchronous HTTP between Order → Credit" in root `AGENTS.md` §3, and update that section.)
- Backfill wallets for existing users before any cloud deployment (D10 covers local data only).
  `user.events` keeps 7 days (K8), so this needs a one-off script or the User Service re-publishing,
  not a replay.
- Contract test in CI that the User Service's `UserRegistered` still has what Credit reads (K12):
  with #54, written with the User owners.
- Later: move per-consumer Kafka settings (retry delays, topic list) out of the root `.env` into a
  separate config area, e.g. with Terraform in `infra/` (Jian Bing's reminder).
- Cloud (#58): the local broker is one node with no authentication and replication factor 1; the
  cloud needs a managed Kafka (e.g. Amazon MSK) or a private, authenticated broker. Decided in the
  cloud work.
- Who watches the dead-letter queue and the `credit_command_dead_lettered` log (Centralized
  Logging N2H?).
- Root `AGENTS.md` §8: record the exception that Credit's internal routes take `requesterId` /
  `courierId` from an authenticated service caller.

## 9. Phases 2–3 on Kafka (added 2026-10-14)

### 9.1 Decisions (Jian Bing, with Jie Yang for the broker)

| # | Decision | Reason given |
|---|---|---|
| K1 | **Kafka** is the broker. | Industry standard; per-key ordering; customisable, accepting the extra work. |
| K2 | A command that can't be applied **steps aside** (non-blocking retries) instead of blocking its partition. | Credit commands don't depend on order: reserve is synchronous and checks the live balance, the key is `orderId`, and transfer and release of one hold exclude each other. |
| K3 | **Hybrid retries**: retry topics for automatic retries; after the last one, the command goes to a dead-letter topic (DLT), and a consumer copies each dead letter into a table. | Retry topics are the common Kafka setup; a DLT lets the team show the async workflow in a Kafka UI; the table makes dead letters easy to inspect. |
| K4 | Dead letters are listed and replayed through **admin-only HTTP endpoints**. | A script would need terminal (SSH) access in the cloud; an endpoint works from Postman. |
| K5 | **Events go to the publisher's topic, commands to the receiver's topic.** Order keeps sending commands to Credit rather than Credit reacting to Order's events. | Keeps the one-way Order → Credit dependency (Order orchestrates); Credit stays away from Order's states, which should be abstracted away. |
| K6 | **Each topic's owner defines its message shape** (customer–supplier: the downstream asks if it needs more). Credit owns the command shape; the User Service owns `UserRegistered`. | Teams can develop independently. |
| K7 | Kafka's folder is **`infra/kafka/`**. | Terraform for the cloud will live in `infra/` too. |
| K8 | `user.events` keeps Kafka's **default 7-day retention**. | No requirement for replay. |
| K9 | **All topics are created centrally** by the `infra/kafka` init container from **one topic list file**; no service creates topics. | Topics spread over many files would make configuration and tracing hard; creating topics is outside a service's scope; one permission model; maps directly onto Terraform. |
| K10 | **Retry delays: one variable per consumer in the root `.env`** (`CREDIT_RETRY_DELAYS`). *Revised 2026-10-16 (option C):* the retry topics are **listed in `topics.txt`** like every other topic, and the consumer checks at startup that one retry topic exists per delay, refusing to start otherwise. | Central config; each consumer keeps its own timing (Claude Code pointed out Notification's 10 s target, NFR3.4). Revision: one source of truth for all topics (PR #84 review); which topics exist and how long retries wait are two facts, kept in step by the check. |
| K11 | **Each consumer has its own DLT per source topic**; a malformed `UserRegistered` goes to `credit.user-events.dlt`. A transfer or release with no hold is a bug and is dead-lettered at once. | Not one shared DLT: a message can fail for one consumer and succeed for another. |
| K12 | **Tolerant reader**: Credit validates only the `UserRegistered` fields it uses (`userId`), plus a contract test in CI (with #54). | Fewer messages count as malformed; breaking changes are caught before deploy. |
| K13 | **Order → Supplier reads become plain HTTP** (proposal for the team; changes root `AGENTS.md` §3). | Order waits for the answer, so a broker adds machinery without removing the coupling, as with the synchronous reserve (D2). |
| — | Execution: Node 24 locally (`.nvmrc`), one PR per phase. | The Kafka client has prebuilt binaries for Node 18–24 only. |

### 9.2 Details (Proposed, AI, unless marked; confirmed by Jian Bing on 2026-10-15)

- **Client:** `@confluentinc/kafka-javascript` (KafkaJS-style API; a client library, the broker is
  Apache Kafka). Fallback: `kafkajs`.
- **Topics** (all from `infra/kafka/topics.txt`; broker auto-creation off; K9):

  | Topic | Key | Partitions |
  |---|---|---|
  | `user.events` | `userId` | 3 |
  | `credit.commands` | `orderId` | 3 |
  | `credit.commands.retry.0` … `.retry.4` | `orderId` | 1 each, one per entry in `CREDIT_RETRY_DELAYS` (default `1s,5s,30s,2m,10m`) |
  | `credit.commands.dlt` | `orderId` | 1 |
  | `credit.user-events.dlt` | `userId` | 1 |

  The init container creates exactly the listed topics; `topics.txt` is the one list (K10 revised).
  Credit checks at startup that one retry topic exists per entry in `CREDIT_RETRY_DELAYS` and that
  no extra one does, and refuses to start, saying what to fix, if not.
- **Message shapes:** Credit's commands carry a `type` field and are validated strictly:
  `{type: "TransferCredits", eventId, orderId, courierId}`, `{type: "ReleaseCredits", eventId, orderId}`.
  For `UserRegistered`, Credit reads only `userId` (a UUID) and, when present, `eventId` for logs;
  a message with another `type` is ignored (K12). The shape itself is the User Service's (K6).
- **Wallet events:** a valid `UserRegistered` creates the wallet (idempotent); one without a valid
  `userId` goes to `credit.user-events.dlt` (K11). An unexpected error (e.g. the database is down)
  pauses the partition and retries in place.
- **Retry flow (commands):** a failure is *retryable* (`WALLET_NOT_FOUND`, or an unexpected error)
  or *permanent* (any other error code, including `HOLD_NOT_FOUND`, or an invalid message). A
  retryable failure goes to the next retry topic with headers `x-attempt` and `x-due-at`; the
  consumer pauses that partition until the message is due. After the last retry, or at once for a
  permanent failure, it goes to `credit.commands.dlt` with `x-error`, `x-error-code`, `x-attempt` and
  `x-dead-lettered-at`, logged at `error` as `credit_command_dead_lettered` (ids only, never balances).
- **Offsets** are stored only after the work (and any retry/DLT publish) succeeds; the handlers are
  idempotent (§4.1, §4.3), so no Kafka transactions or inbox table are needed.
- **Dead-letter table** `credit_dead_letters`: `id`, `event_id` (null when unreadable; unique per
  `source_topic`, so one source can't overwrite another's row — security review, 2026-10-15),
  `source_partition`, `source_offset` (where the original message sat; a dead letter without an event
  id is recognised on redelivery by them plus a hash of its payload, since Kafka offsets restart if
  its volume is reset — PR #85 and security reviews, 2026-10-16),
  `message_key` (the Kafka key; `order_id` before 2026-10-18), `source_topic`, `message_type` (the message `type`; `command_type` before 2026-10-18), `payload`, `error`, `error_code`,
  `attempts`, `dead_lettered_at`, `replay_claimed_at`, `replayed_at`. Second PR #85 review (2026-10-16):
  `payload` is `BYTEA` (exact bytes; TEXT can't hold NUL); a replay claims the row, sends, then sets
  `replayed_at`, and a claim left by a crash is retaken after 6 minutes; a command keyed by anything
  but its `orderId` is dead-lettered; replay takes no request body. A command that dies again after a replay reopens
  its row. Both DLTs are copied into it.
- **Endpoints** (ADMIN JWT, verified by Credit; a USER gets 403, logged as `access_denied`, before
  any validation):
  - `GET /admin/credits/dead-letters?status=open|replayed|all` (default `open`) → `{items: [...]}`,
    newest first, at most 100; never balances.
  - `POST /admin/credits/dead-letters/:eventId/replay` → republishes a credit command to
    `credit.commands` (fresh attempt count) and sets `replayed_at`; **404** `DEAD_LETTER_NOT_FOUND`;
    **409** `ALREADY_REPLAYED`; **409** `NOT_REPLAYABLE` for a user-event dead letter (fix and
    re-publish it from the User Service).
- **Compose:** `infra/kafka/` (K7): one KRaft broker (`apache/kafka:4.1.0`, replication factor 1,
  named volume), the init container, and Kafka UI (`ghcr.io/kafbat/kafka-ui:v1.3.0`) on
  `127.0.0.1:8085`, bound to localhost because it has no login. Host listener `127.0.0.1:9094`.
- **Phases:** Phase 2 PR = broker, client, wallets from `UserRegistered` and its DLT topic.
  Phase 3 PR = commands, retries, `credit.commands.dlt`, the dead-letter table and admin routes.

### 9.3 Not in this step

- Removing lazy wallet creation and adding reserve's 409 `WALLET_NOT_FOUND` (§4.1, §4.2): waits
  for the User Service to publish `UserRegistered`. Until then a transfer never hits a missing
  wallet, so the retry path is exercised by tests rather than by real traffic.
- ~~Removing the HTTP transfer/release routes (§4.3)~~: done 2026-10-18, by team consensus, since the
  Order Service doesn't exist yet and nothing called them.
- Gateway routes for `/admin/credits/**`: added with the balance route once PR #69 merges.
