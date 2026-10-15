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
credit_dead_letters (                           -- copied from Credit's dead-letter topics
    id                BIGSERIAL PRIMARY KEY,
    event_id          UUID,                     -- null when the message was unreadable
    order_id          UUID,
    source_topic      TEXT NOT NULL,            -- credit.commands or user.events
    command_type      TEXT,                     -- the message's type field
    payload           TEXT NOT NULL,
    error             TEXT NOT NULL,
    error_code        TEXT,
    attempts          INTEGER NOT NULL CHECK (attempts > 0),
    dead_lettered_at  TIMESTAMPTZ NOT NULL,
    replayed_at       TIMESTAMPTZ,              -- null while open
    UNIQUE (source_topic, event_id)
)
```

- An account is created on first use (`INSERT … ON CONFLICT DO NOTHING`), as agreed in
  `user-service/AGENTS.md`, until a `UserRegistered` event exists.
- `courier_id` was added so a repeated transfer can be told apart from one to a different courier.
- The `CHECK` constraints are a backstop: code that slipped past the conditional update would fail
  instead of storing a negative balance.
- A dead letter is unique per `(source_topic, event_id)`, so a message from one topic can never
  overwrite another topic's row. A command that dies again after a replay updates its row and
  reopens it; an older copy of the same dead letter changes nothing.

## API [Proposed]

_Origin: AI doc (paths and status codes proposed by Claude Code, approved by Jian Bing)._
Every route needs `X-Service-Key`; bodies are strict (unknown fields → 400). Errors use Problem
Details (`application/problem+json`), as in the Supplier Service.

| Route | Body | Success | Errors |
|---|---|---|---|
| `POST /internal/credits/reserve` | `{orderId, requesterId, amount}` | **201** new hold; **200** same body for a repeat | 409 insufficient credits (nothing kept); 409 same order with a different requester or amount |
| `POST /internal/credits/transfer` | `{orderId, courierId}` | **200**, also for a repeat to the same courier | 404 unknown order; 409 already released, already paid to a different courier, or courier is the requester |
| `POST /internal/credits/release` | `{orderId}` | **200**, also for a repeat | 404 unknown order; 409 already transferred |
| any, wrong or missing key | | | 401, logged as `access_denied` without the key |
| `GET /credits/:userId` (user JWT; through the gateway once PR #69's Envoy route is added) | — | **200** `{userId, available, reserved}` | 400 path id not a UUID; 401 no/invalid token; 403 a USER asking for another user (logged); 404 `WALLET_NOT_FOUND`; 503 JWKS unreachable |
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
  keyed by `orderId`; Credit owns their shape and checks it strictly:
  `{type: "TransferCredits", eventId, orderId, courierId}`, `{type: "ReleaseCredits", eventId, orderId}`.
  They run the same `transfer` / `release` code as the HTTP routes, so a repeat is a no-op.
  - **Retryable** failures (`WALLET_NOT_FOUND`, or an unexpected error such as the database being
    down) step aside to `credit.commands.retry.<n>`, one topic per entry in `CREDIT_RETRY_DELAYS`
    (default `1s,5s,30s,2m,10m`), with headers `x-attempt` and `x-due-at`. A not-yet-due retry
    pauses its partition until due; each retry topic has one delay, so this delays nothing behind it.
  - **Permanent** failures (any other error code, including `HOLD_NOT_FOUND`, which is a bug, K11;
    or an invalid message), and retries that run out, go to **`credit.commands.dlt`** with
    `x-error`, `x-error-code`, `x-source-topic`, `x-dead-lettered-at`, logged at `error` as
    `credit_command_dead_lettered` (ids only).
- **Dead letters:** Credit copies both DLTs into `credit_dead_letters`; admins list and replay them
  through the admin routes (API above). Only credit commands can be replayed.
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
- Transaction history (the profile page links to one): not built.
- Order id format: assumed UUID, matching user ids. Confirm when the Order Service is designed.
- Record root `AGENTS.md` §8's exception for authenticated service callers, if the team agrees.
