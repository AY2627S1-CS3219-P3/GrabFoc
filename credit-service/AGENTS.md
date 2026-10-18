<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
Scope: Wrote this file from Jian Bing's Credit Service design (learning-mode session) and the
       details Claude Code proposed and he approved in the implementation plan.
Author review: pending — Jian Bing to record what he checked.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
Scope: Documented the balance route, JWT verification and error codes (redesign Phase 1).
Author review: pending — Jian Bing to record what he checked.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
Scope: Added the Messaging section for redesign Phase 2 (wallets from UserRegistered over Kafka).
Author review: pending — Jian Bing to record what he checked.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
Scope: Documented Phase 3: credit commands, retries, the dead-letter table and the admin routes.
Author review: pending — Jian Bing to record what he checked.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
Scope: Documented the dead letters' source position and payload hash (PR #85 and security reviews);
key check, byte payloads, replay claims and retiring retry delays (second PR #85 review).
Author review: pending — Jian Bing to record what he checked.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
Scope: A repeated reserve returns the hold's current state (PR #48 review); only the /internal
routes need the service key (PR #73 review).
Author review: pending — Jian Bing to record what he checked.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
Scope: Documented credit_transactions (PR #48 review; design decided by Jian Bing).
Author review: pending — Jian Bing to record what he checked.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
Scope: Documented GET /credits/:userId/transactions (route decided by Jian Bing).
Author review: pending — Jian Bing to record what he checked.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
Scope: Documented that old wallets are purged, not backfilled (PR #93 review; decided by Jian Bing).
Author review: pending — Jian Bing to record what he checked.
-->

# AGENTS.md — Credit Service

Read the root `AGENTS.md` first. This file holds Credit-specific rules only.

**Owner:** Zi Yi (Gantt). This first version was designed and built by Jian Bing, so everything
below is **[Proposed]** until Zi Yi confirms it.

## What it does

_Origin: Restated from the Backlog (CSFR1–4, NFR1.3, NFR1.4, NFR2.1)_

- One account per user, with separate **available** and **reserved** balances. New accounts get
  **10** available credits. Credits are whole numbers.
- **Reserve** on order creation: available → reserved, only if enough is available (CSFR2).
- **Transfer** on completion: the requester's reserved → the courier's available (CSFR3).
- **Release** on cancellation: reserved → back to the requester's available (CSFR4).
- No operation is applied twice or half-applied; no balance goes negative; credits are never
  created or lost.

## Design [Proposed]

_Origin: Team (Jian Bing, 2026-10-11)_

- The **Order Service is the only caller** of reserve, transfer and release, over synchronous HTTP.
- **One hold per order**, unique on the order id. Its state moves `RESERVED → TRANSFERRED` or
  `RESERVED → RELEASED`; both are final.
- **Idempotency key = order id + action.** The amount is stored data, not part of the key. A repeat
  of an applied request changes nothing and returns the original result, so Order can retry safely
  without special handling.
- A repeat whose amount or requester differs is **rejected**, never overwritten: Order can't
  legitimately change a credit offer (O1.3.3), so a mismatch means a bug.
- **PostgreSQL enforces all of it** (unique constraint, conditional updates, one transaction per
  operation), chosen over in-memory, Redis or queue-based approaches, because "this operation
  happened" and "the balance changed" must commit together.
- **Overdraw protection:** the balance changes in one conditional statement,
  `… WHERE available >= amount`, so different orders reserving at once can't go negative.
- A requester may have several open orders (D1 as written; only couriers are limited, OSFR2.4).
- **Service authentication:** routes live under `/internal/**`, require the shared
  `X-Service-Key`, and are never routed by the gateway. Because the caller is authenticated as
  Order, `requesterId` and `courierId` come from the request body. This is a deliberate exception
  to root `AGENTS.md` §8: auto-cancel (O1.4.4) has no user token to forward.

## Schema [Proposed]

_Origin: AI doc (proposed by Claude Code, approved by Jian Bing in the implementation plan)._
SQL lives in `src/db/schema.ts`; keep the two in sync.

```sql
credit_accounts (
    user_id     UUID PRIMARY KEY,
    available   INTEGER NOT NULL DEFAULT 10 CHECK (available >= 0),
    reserved    INTEGER NOT NULL DEFAULT 0  CHECK (reserved >= 0),
    created_at, updated_at TIMESTAMPTZ
)
credit_holds (
    order_id      UUID PRIMARY KEY,                 -- the idempotency key
    requester_id  UUID NOT NULL REFERENCES credit_accounts,
    courier_id    UUID REFERENCES credit_accounts,  -- set exactly when TRANSFERRED
    amount        INTEGER NOT NULL CHECK (amount > 0),
    state         TEXT NOT NULL  -- RESERVED | TRANSFERRED | RELEASED
    created_at, updated_at TIMESTAMPTZ
)
credit_transactions (                           -- every balance change, append-only
    id                BIGSERIAL PRIMARY KEY,
    user_id           UUID NOT NULL REFERENCES credit_accounts,
    order_id          UUID,                     -- null for the starting grant
    type              TEXT NOT NULL  -- GRANT | RESERVE | TRANSFER_OUT | TRANSFER_IN | RELEASE
    available_change  INTEGER NOT NULL,
    reserved_change   INTEGER NOT NULL,
    created_at        TIMESTAMPTZ,
    UNIQUE (order_id, user_id, type)            -- plus: at most one GRANT per user
)
credit_dead_letters (                           -- copied from Credit's dead-letter topics
    id                BIGSERIAL PRIMARY KEY,
    event_id          UUID,                     -- null when the message was unreadable
    order_id          UUID,
    source_topic      TEXT NOT NULL,            -- credit.commands or user.events
    source_partition  INTEGER,                  -- where the original message sat in source_topic
    source_offset     BIGINT,
    command_type      TEXT,                     -- the message's type field
    payload           BYTEA NOT NULL,           -- exact bytes (TEXT can't hold e.g. NUL)
    error             TEXT NOT NULL,
    error_code        TEXT,
    attempts          INTEGER NOT NULL CHECK (attempts > 0),
    dead_lettered_at  TIMESTAMPTZ NOT NULL,
    replay_claimed_at TIMESTAMPTZ,              -- a replay in progress; reclaimable after 6 min
    replayed_at       TIMESTAMPTZ,              -- null while open; set once Kafka accepted the replay
    UNIQUE (source_topic, event_id)
)
UNIQUE INDEX credit_dead_letters_source_message
    ON credit_dead_letters (source_topic, source_partition, source_offset, md5(payload))
```

- An account is created on first use (`INSERT … ON CONFLICT DO NOTHING`), as agreed in
  `user-service/AGENTS.md`, until a `UserRegistered` event exists.
- `courier_id` was added so a repeated transfer can be told apart from one to a different courier.
- The `CHECK` constraints are a backstop: code that slipped past the conditional update would fail
  instead of storing a negative balance.
- **`credit_transactions` is the history record** (root `AGENTS.md` §8; decided by Jian Bing because
  the frontend wants a transaction history and it fits new kinds of movement later). Every balance
  change appends rows in the **same transaction** as the change: `GRANT` (+10) when a wallet is
  created, `RESERVE` (−n available, +n reserved), `TRANSFER_OUT` (−n reserved, requester) and
  `TRANSFER_IN` (+n available, courier), `RELEASE` (+n available, −n reserved). Rows are never
  updated or deleted, a repeated request adds none, and each user's rows add up to their balance.
- **No backfill** (decided by Jian Bing, PR #93 review): a wallet created before this table existed
  has no rows, so its rows would not add up to its balance. Nothing is deployed yet, so purge local
  Credit data when this lands (`docker compose down -v`) instead of migrating it.
- A dead letter is unique per `(source_topic, event_id)`, so a message from one topic can never
  overwrite another topic's row. One without a readable event id is recognised by where its
  original message sat (`source_partition`, `source_offset`, carried in the `x-source-partition` /
  `x-source-offset` headers) plus a hash of its payload, so a redelivery doesn't add a second row.
  The hash matters because Kafka restarts offsets if its volume is reset while this table keeps
  its rows. A clash on either unique key is logged as `dead_letter_already_recorded` and skipped,
  never retried forever. A command that dies again after a replay updates its row and
  reopens it; an older copy of the same dead letter changes nothing.

## API [Proposed]

_Origin: AI doc (paths and status codes proposed by Claude Code, approved by Jian Bing)._
The three `/internal/credits/*` routes need `X-Service-Key`; the balance and admin dead-letter routes
need a user JWT (neither credential opens the other's routes); bodies are strict (unknown fields → 400). Errors use Problem
Details (`application/problem+json`), as in the Supplier Service.

| Route | Body | Success | Errors |
|---|---|---|---|
| `POST /internal/credits/reserve` | `{orderId, requesterId, amount}` | **201** new hold; **200** for a repeat, with the hold as it is now (its `state` may have moved on to `TRANSFERRED` or `RELEASED`) | 409 insufficient credits (nothing kept); 409 same order with a different requester or amount |
| `POST /internal/credits/transfer` | `{orderId, courierId}` | **200**, also for a repeat to the same courier | 404 unknown order; 409 already released, already paid to a different courier, or courier is the requester |
| `POST /internal/credits/release` | `{orderId}` | **200**, also for a repeat | 404 unknown order; 409 already transferred |
| any, wrong or missing key | | | 401, logged as `access_denied` without the key |
| `GET /credits/:userId` (user JWT; through the gateway once PR #69's Envoy route is added) | — | **200** `{userId, available, reserved}` | 400 path id not a UUID; 401 no/invalid token; 403 a USER asking for another user (logged); 404 `WALLET_NOT_FOUND`; 503 JWKS unreachable |
| `GET /credits/:userId/transactions?limit=&before=` (user JWT) | — | **200** `{items: [{id, orderId, type, availableChange, reservedChange, createdAt}], nextBefore}`, newest first; `limit` 1–100 (default 20); `before` is the `nextBefore` from the previous page; `nextBefore` is `null` on the last page | 400 path id not a UUID, a bad `limit`/`before`, or an unknown parameter; 401; 403 a USER asking for another user (logged); 404 `WALLET_NOT_FOUND`; 503 JWKS unreachable |
| `GET /admin/credits/dead-letters?status=open\|replayed\|all` (ADMIN JWT; default `open`) | — | **200** `{items: [...]}`, newest first, at most 100 | 400 unknown status; 401; 403 a USER (logged, checked before validation) |
| `POST /admin/credits/dead-letters/:eventId/replay` (ADMIN JWT) | — | **200** the dead letter, `replayedAt` set; the command is republished to `credit.commands` with a fresh attempt count | 400 id not a UUID; 401; 403 a USER (logged); 404 `DEAD_LETTER_NOT_FOUND`; 409 `ALREADY_REPLAYED`; 409 `NOT_REPLAYABLE` (a user-event dead letter: fix and re-publish it from the User Service) |

The three internal routes return the hold: `{orderId, requesterId, courierId, amount, state}`.

Errors carry a machine-readable `code` (`INSUFFICIENT_CREDITS`, `WALLET_NOT_FOUND`, `HOLD_MISMATCH`,
`ALREADY_TRANSFERRED`, `ALREADY_RELEASED`, `COURIER_IS_REQUESTER`, `HOLD_NOT_FOUND`,
`DEAD_LETTER_NOT_FOUND`, `ALREADY_REPLAYED`, `NOT_REPLAYABLE`); validation and
auth errors have none. The balance route verifies the user JWT itself against `CREDIT_JWKS_URL`
(the User Service JWKS, as the Supplier Service does); the `/internal` routes keep the service key,
and neither credential opens the other's routes. The balance route never creates a wallet.

## Messaging [Proposed]

_Origin: Team (Jian Bing's decisions K1–K13 in the redesign spec §9); AI doc (details proposed by
Claude Code and confirmed by him). Rules for every service: root `AGENTS.md` §3 "Messaging (Kafka)"._

- **Broker:** the shared Kafka in `infra/kafka/` (`kafka:9092` in Compose, `localhost:9094` from
  the host). `kafka-init` creates every topic; Credit creates none.
- **Consumer group** `credit-service`, starting from the oldest message the first time. An offset
  is stored only after its message's work is saved; a crash re-reads it, which is safe because every
  handler is idempotent.
- **`user.events` → wallets (Phase 2).** A `UserRegistered` creates the wallet with the starting
  credits (`INSERT … ON CONFLICT DO NOTHING`, so a repeat grants nothing).
  - The User Service owns the event (#54). Credit reads only `type === "UserRegistered"`, a UUID
    `userId`, and `eventId` for logs when valid; other fields and event types are ignored.
  - A `UserRegistered` without a valid `userId`, or a value that isn't a JSON object, goes to
    **`credit.user-events.dlt`** with headers `x-attempt`, `x-error`, `x-source-topic`,
    `x-dead-lettered-at`, and is logged as `user_event_dead_lettered`. It can't be replayed from
    Credit: the User Service fixes and re-publishes it.
  - An unexpected error (e.g. the database is down) pauses the partition for 5 s and retries.
- Lazy wallet creation (`ensureAccount`) stays until the User Service publishes (#79).
- **Local setup:** Node 24 (`.nvmrc`; the Kafka client has prebuilt binaries for Node 18–24),
  `npm run test:kafka` against the Compose broker. The client's install script is approved in
  `package.json` (`allowScripts`), because npm 11 skips dependency install scripts by default.
- **`credit.commands` → transfer and release (Phase 3).** Order sends commands to Credit's topic,
  keyed by `orderId` (a command keyed by anything else is dead-lettered, since order holds only per
  key); Credit owns their shape and checks it strictly:
  `{type: "TransferCredits", eventId, orderId, courierId}`, `{type: "ReleaseCredits", eventId, orderId}`.
  They run the same `transfer` / `release` code as the HTTP routes, so a repeat is a no-op.
  - **Retryable** failures (`WALLET_NOT_FOUND`, or an unexpected error such as the database being
    down) step aside to `credit.commands.retry.<n>`, one topic per entry in `CREDIT_RETRY_DELAYS`
    (default `1s,5s,30s,2m,10m`), with headers `x-attempt` and `x-due-at`. The retry topics are
    listed in `infra/kafka/topics.txt`; Credit refuses to start if they don't match the delays.
    Retire a delay only after its topic is drained (`infra/kafka/README.md`). A not-yet-due retry
    pauses its partition until due; each retry topic has one delay, so this delays nothing behind it.
  - **Permanent** failures (any other error code, including `HOLD_NOT_FOUND`, which is a bug, K11;
    or an invalid message), and retries that run out, go to **`credit.commands.dlt`** with
    `x-error`, `x-error-code`, `x-source-topic`, `x-dead-lettered-at`, logged at `error` as
    `credit_command_dead_lettered` (ids only).
- **Dead letters:** Credit copies both DLTs into `credit_dead_letters`; admins list and replay them
  through the admin routes (API above). Only credit commands can be replayed. A replay claims its row
  (`replay_claimed_at`), sends, then sets `replayed_at`; a claim left by a crash can be retaken after
  6 minutes. The replay route takes no request body (any body is a 400).
- The database pool has connection (5 s) and query (10 s) timeouts, so an unreachable database
  becomes an error the consumer retries instead of a hang.

## Concurrency notes

_Origin: AI doc_

- Concurrent identical reserves: the second `INSERT … ON CONFLICT` waits for the first
  transaction, then inserts nothing and returns the existing hold.
- Transfer and release racing on one order: both update `WHERE state = 'RESERVED'`; the second
  waits for the first's row lock, re-checks, and updates nothing.
- Transfer updates two accounts in user-id order, so opposite transfers can't deadlock.
- All of these are covered by `src/credits/credits.service.int.spec.ts`.

## Open items

- Confirm this design with Zi Yi (owner).
- Gateway route for `GET /credits/:userId`: waiting for PR #69 (Envoy); add
  `api-gateway/envoy/routes/30-credit.routes.json` and `CREDIT_SERVICE_URL` then.
- #79: remove lazy wallet creation and the HTTP transfer/release routes once the User Service
  publishes `UserRegistered` (#54) and the Order Service sends the commands (#53, #56).
- Gateway routes for `GET /credits/:userId` and `/admin/credits/**` (#60).
  Spec: `docs/superpowers/specs/2026-10-14-credit-service-redesign-design.md` §9.
- Confirm Kafka and root `AGENTS.md` §3 "Messaging (Kafka)" with the whole team.
- Transaction history: recorded in `credit_transactions`; a route to read it (for the profile page) is not built yet.
- Order id format: assumed UUID, matching user ids. Confirm when the Order Service is designed.
- Record root `AGENTS.md` §8's exception for authenticated service callers, if the team agrees.
