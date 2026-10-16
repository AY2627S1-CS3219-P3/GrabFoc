<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
Scope: Wrote this file from Jian Bing's Credit Service design (learning-mode session) and the
       details Claude Code proposed and he approved in the implementation plan.
Author review: pending — Jian Bing to record what he checked.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
Scope: A repeated reserve returns the hold's current state (PR #48 review).
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
```

- An account is created on first use (`INSERT … ON CONFLICT DO NOTHING`), as agreed in
  `user-service/AGENTS.md`, until a `UserRegistered` event exists.
- `courier_id` was added so a repeated transfer can be told apart from one to a different courier.
- The `CHECK` constraints are a backstop: code that slipped past the conditional update would fail
  instead of storing a negative balance.

## API [Proposed]

_Origin: AI doc (paths and status codes proposed by Claude Code, approved by Jian Bing)._
Every route needs `X-Service-Key`; bodies are strict (unknown fields → 400). Errors use Problem
Details (`application/problem+json`), as in the Supplier Service.

| Route | Body | Success | Errors |
|---|---|---|---|
| `POST /internal/credits/reserve` | `{orderId, requesterId, amount}` | **201** new hold; **200** for a repeat, with the hold as it is now (its `state` may have moved on to `TRANSFERRED` or `RELEASED`) | 409 insufficient credits (nothing kept); 409 same order with a different requester or amount |
| `POST /internal/credits/transfer` | `{orderId, courierId}` | **200**, also for a repeat to the same courier | 404 unknown order; 409 already released, already paid to a different courier, or courier is the requester |
| `POST /internal/credits/release` | `{orderId}` | **200**, also for a repeat | 404 unknown order; 409 already transferred |
| any, wrong or missing key | | | 401, logged as `access_denied` without the key |

All three return the hold: `{orderId, requesterId, courierId, amount, state}`.

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
- `GET` own balance for users (CSFR1.2) through the gateway, with JWT auth: not built.
- Insufficient credits and a mismatch are both 409; Order can only tell them apart by `detail`.
  A machine-readable `code` field would need a team decision on the error shape.
- Transaction history (the profile page links to one): not built.
- Order id format: assumed UUID, matching user ids. Confirm when the Order Service is designed.
- Record root `AGENTS.md` §8's exception for authenticated service callers, if the team agrees.
