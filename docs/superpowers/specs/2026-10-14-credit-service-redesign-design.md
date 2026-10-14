<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
Scope: Wrote this spec from Jian Bing's design decisions (made in a learning-mode brainstorming
       session) and the additions Claude Code proposed and he confirmed as proposals.
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
| `TransferCredits` | Order → Credit | broker command | `{eventId, orderId, courierId}` | ✓ |
| `ReleaseCredits` | Order → Credit | broker command | `{eventId, orderId}` | ✓ |
| `UserRegistered` | User → Credit (and anyone else) | broker event | `{eventId, userId, occurredAt}` | ✓ |
| Balance read | Frontend → gateway → Credit | HTTP `GET /credits/:userId` | — | ✓ |

**Broker layout (Proposed, AI):** one broker shared by all services, one channel per owner
(`credit.commands`, `user.events`, later `order.events`). Each service publishes only to its own
channel. Which broker is the team's decision; for reference, RabbitMQ has dead-lettering built in,
Kafka needs it built by hand.

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
  routes for transfer and release are removed once Order uses the commands.
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
| 3 | Transfer/release consumers with retries and DLQ; remove the HTTP transfer/release routes | Order Service outbox and credit client |

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

- Broker choice (team).
- Confirm with the mentor that moving transfer/release to the broker changes the [Decided]
  "synchronous HTTP between Order → Credit" in root `AGENTS.md` §3, and update that section.
- Backfill wallets for existing users before any cloud deployment (D10 covers local data only).
- Who watches the dead-letter queue and the `credit_command_dead_lettered` log (Centralized
  Logging N2H?).
- Root `AGENTS.md` §8: record the exception that Credit's internal routes take `requesterId` /
  `courierId` from an authenticated service caller.
