<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-13
Scope: Document the approved schema, database-only implementation, migration commands and verification scope.
Author review: User approved the main schema and database-only plan; implementation review pending. Application/integration decisions remain open.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
Scope: Added the Phase A HTTP API section and updated status lines.
Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
Scope: Rewrote the HTTP API section for Phase B (create with credit clean-up, edit, accept) and documented migration 002.
Author review: Reviewed.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
Scope: Documented the Phase C lifecycle, cancellation and confirmation endpoints.
Author review: Reviewed
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-17
Scope: Documented Phase D step 1: credit settlement over credit.commands, ORDER_KAFKA_BROKERS, credit_settled_at.
Author review: Reviewed
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
Scope: Recorded the manual-check results Zi Yi reported.
Author review: Reviewed
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
Scope: Documented the 60 s expiry worker (Phase D) and the manual-check results Zi Yi reported.
Author review: Reviewed
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
Scope: Documented order.events, the internal active-order lookup and ORDER_SERVICE_KEY (Phase D).
Author review: Reviewed
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
Scope: Recorded the order.events and active-order lookup manual-check results Zi Yi reported.
Author review: Reviewed
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
Scope: Updated the test count after the Phase E tests, and added the Postman section.
Author review: Reviewed
-->

# Order Service

Database foundation for #50 (under parent #64) plus Phases A–C of `docs/order-service-plan.md`: a NestJS server with authenticated read, create, edit, accept, lifecycle, cancellation and confirmation endpoints (see [HTTP API](#http-api)). Phase D so far: credit settlement over Kafka (`credit.commands`), the 60 s expiry worker, `order.events` for Notification and the internal active-order lookup; the suspension/deactivation consumers wait for User and Supplier to publish events. The schema is in `migrations/001_init.sql`, including the `AWAITING_CREDIT` state, the `CREDIT_RESERVED` history action and `orders.credit_settled_at` for credit settlement. Read [AGENTS.md](AGENTS.md) for requirements.

## Confirmed decisions

_Origin: Team (confirmed in chat on 2026-10-12 and 2026-10-13)_

- PostgreSQL for Order.
- Use `pg` with parameterized SQL and numbered SQL migrations, with an Order-local runner tracking applied files, following User Service; confirmed on 2026-10-13. The approved one-shot Compose task runs migrations after PostgreSQL is healthy.
- Save pickup details as a snapshot; later Supplier edits do not silently replace the saved pickup details.
- Delivery also references a Supplier location ID and stores its name/coordinates as a snapshot; confirmed on 2026-10-13. Name and coordinates are sufficient for both snapshots; no address/building/floor snapshot fields are required.
- Both pickup and delivery locations must be ACTIVE when creating an order. Supplier is the authority for location status; validation transport remains unapproved.
- Default timing window is 24 hours from creation when omitted.
- No edits are allowed in ARRIVED. Lifecycle completion/cancellation confirmations remain governed by the FRs.
- Coordinate types match Supplier: latitude NUMERIC(11,9), longitude NUMERIC(12,9), for both snapshots.
- Database-generated UUIDs for orders, history and confirmations; database-generated creation timestamps. New orders default to PENDING with version 1 (positive integer).
- Omitted timing window starts at creation and ends 24 hours later.
- Assignment constraints: PENDING has no courier; ACCEPTED, PICKED_UP, IN_PROGRESS, ARRIVED and COMPLETED require a courier; CANCELLED allows either. Any assigned courier differs from requester. These core details were approved on 2026-10-13.
- Concurrency approved on 2026-10-13: atomic acceptance only while PENDING and unassigned; partial unique courier index for ACCEPTED/PICKED_UP/IN_PROGRESS/ARRIVED; loaded version required for edits and lifecycle actions, reject mismatches and increment version on every successful order change. COMPLETED/CANCELLED assignments do not occupy the active slot.
- History approved on 2026-10-13: order_history with order reference, nullable actor for system actions, action, nullable previous/new states, optional JSONB change_details and occurrence timestamp. Actions: CREATED, EDITED, ACCEPTED, PICKED_UP, IN_PROGRESS, ARRIVED, COMPLETED, CANCELLED. Edits record old/new changed fields, including location snapshots, description and timing; cancellation details distinguish requester, mutual and timeout cancellation. History supplies lifecycle timestamps and is written with the order change in one transaction.
- Confirmation initiation approved on 2026-10-13: after acceptance, either requester or assigned courier initiates timing changes (requester-only until Zi Yi changed it on 2026-10-16), mutual cancellation or completion (completion only in ARRIVED). Initiation records the initiator response as ACCEPTED and the other response as PENDING. The order changes only after both approve. PENDING cancellation remains requester-only without a mutual proposal; chat messages do not constitute acknowledgement.
- PENDING timing edits approved on 2026-10-13: requester is the only affected party, so applies edits directly without mutual confirmation; still validate timing, require loaded version and record history. Mutual acknowledgement applies after acceptance. This user-confirmed exception clarifies the blanket O1.3.7-8 wording; backlog wording itself is unchanged.
- Timing-change proposal expiry approved on 2026-10-13: expire when current time >= the existing window_end, with no shorter deadline. Expiry leaves the window unchanged, rejects later approval and preserves the proposal for traceability. The proposed new window does not extend the approval deadline.
- Cancellation/completion proposal lifetime approved on 2026-10-13: no independent expiry timer; pending until approved, rejected or invalidated by the order becoming terminal through another action. Outstanding proposals cannot be approved after COMPLETED/CANCELLED. Existing order timeout rules still apply and exclude ARRIVED. Terminal invalidation uses the approved SUPERSEDED status.
- Concurrent proposal limit approved on 2026-10-13: at most one PENDING confirmation proposal per order, across all kinds. Reject new proposals while one is pending; no automatic replacement. Enforce with a partial unique index on order_id WHERE status = PENDING, including concurrent submissions. Applying approval rechecks current order state/version.
- Terminal-action invalidation approved on 2026-10-13: outstanding pending proposals invalidated by another terminal action become SUPERSEDED with resolved_at, saved in the same transaction as the terminal order change/history; reject later responses. A proposal causing completion/cancellation is APPROVED. Timing proposals reaching their deadline remain EXPIRED.
- Confirmation row constraints approved on 2026-10-13: kind restricted to TIMING_CHANGE/CANCELLATION/COMPLETION; responses to PENDING/ACCEPTED/REJECTED; status to PENDING/APPROVED/REJECTED/EXPIRED/SUPERSEDED. TIMING_CHANGE requires both proposed timing fields with end after start; other kinds require both null. resolved_at is null while PENDING and required for resolved states. APPROVED requires both responses ACCEPTED; rejection by either party resolves as REJECTED. Participant, order-state and expiry checks remain transaction-level service logic.
- Whole-number credit offer of at least 1.
- One free-text `order_description` on `orders` captures what to do and special instructions; no separate item table or delivery-description field.

## Approved schema

_Origin: AI design, reviewed and approved by the user on 2026-10-13; implementation review pending_

Types match the documented external identifiers: User UUID and Supplier INTEGER. External references have no cross-service foreign keys. Local order references below use foreign keys to `orders.id`.

| Table | Columns |
|---|---|
| `orders` | `id UUID PK`; `order_description TEXT NOT NULL`; `requester_id UUID NOT NULL`; `courier_id UUID NULL`; `pickup_location_id INTEGER NOT NULL`; `pickup_name TEXT NOT NULL`; `pickup_lat NUMERIC(11,9) NOT NULL`; `pickup_lon NUMERIC(12,9) NOT NULL`; `delivery_location_id INTEGER NOT NULL`; `delivery_name TEXT NOT NULL`; `delivery_lat NUMERIC(11,9) NOT NULL`; `delivery_lon NUMERIC(12,9) NOT NULL`; `credit_offer INTEGER NOT NULL CHECK >= 1`; `status TEXT NOT NULL`; `window_start TIMESTAMPTZ NOT NULL`; `window_end TIMESTAMPTZ NOT NULL`; `created_at TIMESTAMPTZ NOT NULL`; `updated_at TIMESTAMPTZ NOT NULL`; `version INTEGER NOT NULL` |
| `order_history` | `id UUID PK`; `order_id UUID NOT NULL FK`; `actor_id UUID NULL`; `action TEXT NOT NULL`; `previous_status TEXT NULL`; `new_status TEXT NULL`; `change_details JSONB NULL`; `occurred_at TIMESTAMPTZ NOT NULL` |
| `order_confirmations` | `id UUID PK`; `order_id UUID NOT NULL FK`; `kind TEXT NOT NULL`; `proposed_by UUID NOT NULL`; `proposed_window_start TIMESTAMPTZ NULL`; `proposed_window_end TIMESTAMPTZ NULL`; `requester_response TEXT NOT NULL`; `courier_response TEXT NOT NULL`; `status TEXT NOT NULL`; `created_at TIMESTAMPTZ NOT NULL`; `resolved_at TIMESTAMPTZ NULL` |

`status` on orders is restricted to PENDING, ACCEPTED, PICKED_UP, IN_PROGRESS, ARRIVED, COMPLETED and CANCELLED. Require end after start, positive version and distinct requester/courier. Courier is null before assignment; new orders start PENDING. Status/assignment constraints and database-generated UUID/creation defaults are approved as listed above. Version update/concurrency behaviour is approved as listed above.

For Zi Yi's revised creation flow (2026-10-15, **[Proposed]**), `001_init.sql` also has the `AWAITING_CREDIT` state (no courier), the `CREDIT_RESERVED` history action and a nullable `orders.credit_settled_at TIMESTAMPTZ` (named `credit_released_at` until Phase D; `001_init.sql` was edited in place on 2026-10-17, so recreate the volume: `docker compose down -v`). The column default stays `PENDING`; the API inserts `AWAITING_CREDIT` explicitly. No new indexes.

Confirmation kinds: TIMING_CHANGE, CANCELLATION, COMPLETION. Party responses: PENDING, ACCEPTED, REJECTED. Proposal states: PENDING, APPROVED, REJECTED, EXPIRED, SUPERSEDED. Only timing-change proposals carry proposed window fields. Keep resolved proposals for traceability. A history entry with null actor can represent a system action; creation can have null previous status, and edits need not change state.

## Approved indexes and transactions

_Origin: AI design, all listed indexes approved by the user on 2026-10-13_

- `(status, created_at)` for available listings; `(requester_id, created_at)` and `(courier_id, created_at)` for user orders.
- Partial unique index on non-null courier for ACCEPTED, PICKED_UP, IN_PROGRESS and ARRIVED to enforce one active assignment.
- Partial index on window end for PENDING, ACCEPTED, PICKED_UP and IN_PROGRESS timeout scans.
- History `(order_id, occurred_at)` and confirmations `(order_id, status)`.
- Approved partial unique confirmation index on order_id WHERE status = PENDING: at most one pending proposal per order across all kinds (2026-10-13).
- Change the order and its local history in one transaction, following the root rule. PostgreSQL transactions do not span Credit's database. Concurrent acceptance must check current state atomically; the partial courier index alone does not prevent replacing an order's courier.

## Referenced information changes

_Origin: Team (snapshot decision); AI design (remaining proposed handling)_

- Preserve the original Supplier location IDs plus names/coordinates for both pickup and delivery. Name and coordinates are sufficient. Handling snapshot replacement when the requester explicitly edits either location remains open.
- User profile changes leave stable requester/courier IDs intact; resolve current display data through an approved contract. Do not copy credentials or unnecessary personal data.
- Keep order history when a location becomes inactive or a user is suspended/deactivated. Rules for continuing active orders, editing or further actions remain open.
- Store both location snapshots locally; subsequent Supplier edits do not silently replace either snapshot. Credit balances/holds remain in Credit Service.

## Open items for application implementation

_Origin: AI doc, restating unresolved chat and AGENTS.md items_

- Core types/defaults, assignment constraints and concurrency mechanisms are approved; all listed indexes are approved; confirmation row constraints are approved; the database-only implementation plan was approved and is implemented.
- Timing duration limits/expiry boundaries remain open; the omitted-window default is 24 hours from creation and PENDING timing edits are requester-only without mutual confirmation.
- Confirmation initiators and initiation counting as approval are approved. Timing-change proposals expire at the existing window end; cancellation/completion proposals have no independent timer and become invalid on terminal orders; one pending proposal per order and SUPERSEDED terminal invalidation are approved. PENDING timing edits apply directly.
- Creation rejects inactive pickup/delivery locations. Validation transport, later deactivation effects, location edits and account status effects remain open; requester active-order limit if any.
- Chat service/database ownership remains open; no chat schema is selected.
- Main schema review is complete: core fields/defaults, history, confirmation rules/row constraints and all listed indexes are approved. The database-only implementation plan was approved on 2026-10-13. Integration contracts and application-level edge cases above remain outside that initial scope.
- Credit communication: root §3 records synchronous HTTP for reserve only, with transfer and release as `credit.commands` messages (Zi Yi, 2026-10-17); the meeting's asynchronous-reservation proposal is not yet approved.
- Broker/event payload and reliable publication mechanism. No outbox pattern is selected here.

Obtain approval for the application/integration plan before adding APIs or integration code.


## Database commands

_Origin: AI doc; implements the approved database-only plan_

Run from the repository root. Set `ORDER_DB_PASSWORD` in the git-ignored root `.env`
(the example contains only a development placeholder):

```powershell
docker compose -f order-service/compose.yaml --env-file .env up --build -d
```

This starts `order-db` with its own `order-db-data` volume and a one-shot
`order-migrate` task after database health checks pass. Successful migration exits
with code 0. `order-service` (port 3005) starts once migration succeeds. The root
Compose file includes all three. The database has no published host port.

Check or rerun migrations explicitly:

```powershell
docker compose -f order-service/compose.yaml --env-file .env logs order-migrate
docker compose -f order-service/compose.yaml --env-file .env run --rm order-migrate
```

Numbered SQL files run in filename order, each in a transaction, with applied files
recorded in `schema_migrations`. A session advisory lock serializes migration runners.
Add a new numbered migration for later changes; do not edit an already-applied file.
Re-running the migration task applies only unapplied files. Keep the existing volume
when stopping/replacing containers.

For local tooling, `npm ci`, `npm run build`, then `npm run migrate` inside
`order-service/`, with the five `ORDER_DB_*` connection settings in process environment.
The CLI does not load `.env` itself. The Compose task supplies these settings explicitly;
passwords are passed separately rather than embedded in a connection URL.

## PostgreSQL integration tests

```powershell
docker compose -f order-service/compose.test.yaml up --build --abort-on-container-exit --exit-code-from order-db-tests
docker compose -f order-service/compose.test.yaml down
```

Tests use a separate Compose project and temporary PostgreSQL storage. Each run uses
its own random schema and does not truncate application tables. For a separately
provided test PostgreSQL instance, set `ORDER_TEST_DATABASE_URL` and run
`npm run test:int` inside `order-service/`.

Tests cover schema/defaults, reference and confirmation constraints, all nine indexes,
migration reruns/concurrent runners and failed-migration rollback, transactional history,
version-conditional edits, concurrent acceptance and concurrent proposal insertion.
Concurrency tests exercise the approved SQL mechanisms directly. The database alone
does not enforce participant authorization, terminal-state transitions, expiry scheduling,
version increments, history creation or Supplier ACTIVE checks: future service handlers
must perform these operations together in the approved transactions.

JSON package metadata carries its disclosure in `description`; `package-lock.json` is
npm-generated from that disclosed manifest. Source/configuration files carry disclosure
headers. Human implementation review remains required before merge.

Verification on 2026-10-13: TypeScript build, root Compose configuration and all 14
PostgreSQL integration tests passed. The production migration image applied
`001_init.sql`; database-container replacement preserved the schema and migration
rerun reported up to date.

## HTTP API

_Origin: AI doc; endpoints from `docs/order-service-plan.md` §3; response shapes, error codes and paging follow Supplier/User conventions and are **[Proposed]** pending team confirmation_

Every route except `/internal/**` (below) needs `Authorization: Bearer <access token>` from the User Service, verified locally
against `ORDER_JWKS_URL` (RS256). The caller's ID is the token's `sub`, never a body field.
Errors use the User Service envelope `{ "error": { "code", "message", "details" } }`.

| Endpoint | Who | Does |
|---|---|---|
| `POST /orders` | any user | create an order; returns it as `PENDING` (201) |
| `GET /orders/available` | any user | unexpired `PENDING` orders, excluding the caller's own |
| `GET /orders/mine` | any user | orders the caller created, any status |
| `GET /orders/assigned` | any user | orders assigned to the caller as courier, any status |
| `GET /orders/:orderId` | requester, assigned courier, or anyone while the order is available | one order |
| `PATCH /orders/:orderId` | requester, `PENDING` only | edit description, locations or timing (200) |
| `POST /orders/:orderId/accept` | any user except the requester | take the order as courier (200) |
| `POST /orders/:orderId/pick-up` | assigned courier | `ACCEPTED` → `PICKED_UP` (200) |
| `POST /orders/:orderId/start-delivery` | assigned courier | `PICKED_UP` → `IN_PROGRESS` (200) |
| `POST /orders/:orderId/arrive` | assigned courier | `IN_PROGRESS` → `ARRIVED` (200) |
| `POST /orders/:orderId/cancel` | requester, `PENDING` only | cancel straight away (200) |
| `GET /orders/:orderId/history` | requester or assigned courier | `{ items }`, oldest first |
| `GET /orders/:orderId/confirmations` | requester or assigned courier | `{ items }`, oldest first |
| `POST /orders/:orderId/confirmations` | requester or assigned courier | propose a timing change, cancellation or completion (201) |
| `POST /orders/:orderId/confirmations/:confirmationId/respond` | the other participant | approve or reject (200) |

Lists take `page` (default 1) and `pageSize` (1–100, default 20) and return
`{ items, page, pageSize, total }`, newest first.

**Create** body: `orderDescription`, `pickupLocationId`, `deliveryLocationId`, `creditOffer`
(whole number ≥ 1), optional `windowStart` / `windowEnd` (ISO 8601 with offset). Omitted start
is now; omitted end is start + 24 hours. Order Service:

1. checks `windowEnd` is after `windowStart` and has not passed;
2. fetches both locations from Supplier (`GET /locations/:id`, forwarding the caller's token);
   both must exist and be `ACTIVE`;
3. checks the window overlaps the **pickup** location's opening hours (campus time, UTC+8;
   closing at or before opening means after midnight; no hours = always open). Delivery hours
   never restrict the window;
4. saves the order as `AWAITING_CREDIT` with `CREATED` history (couriers cannot see it);
5. calls Credit `POST /internal/credits/reserve` (`X-Service-Key`, 5 s timeout, no transaction
   open). On success the order moves to `PENDING` with `CREDIT_RESERVED` history and `version` 2.
   If Credit refuses, fails or times out, the order moves to `CANCELLED`
   (`changeDetails.reason = CREDIT_NOT_RESERVED`, no actor). For `INSUFFICIENT_CREDITS` Credit
   kept nothing, so the order is marked settled at once. Otherwise Order sends `ReleaseCredits`,
   since a timed-out reserve may still have saved a hold.

**Credit settlement job** (`OrdersService.settleCredits`, every 10 s from `main.ts`, each run
after the previous one ends): it cancels `AWAITING_CREDIT` orders older than 30 s, then sends
Credit's commands to `credit.commands`, keyed by `orderId`:

- `{type: "TransferCredits", eventId, orderId, courierId}` for each `COMPLETED` order;
- `{type: "ReleaseCredits", eventId, orderId}` for each `CANCELLED` one;

for orders without `credit_settled_at`, setting it once Kafka has stored the command. The
`orders` table is the outbox: a crash before the mark resends the command, which Credit ignores
as a repeat. A failed send stops the run and logs `CREDIT_SETTLEMENT_FAILED` with the order ID.
Credits therefore move up to about 10 s after the order completes or is cancelled. Design by
Zi Yi (2026-10-15 creation flow, 2026-10-17 commands); **[Proposed]** until the team confirms.

**Expiry worker** (`OrdersService.expireOrders`, every 60 s from `main.ts`, each run after the
previous one ends): cancels `PENDING`, `ACCEPTED`, `PICKED_UP` and `IN_PROGRESS` orders once
`now() >= window_end` (database clock), up to 100 per run. `ARRIVED` never expires. Each order is
locked and rechecked in its own transaction, so a step or approval that committed first wins if
the order is no longer expirable. In that transaction it writes `CANCELLED` history (no actor,
`changeDetails.reason = EXPIRED`), marks a pending `TIMING_CHANGE` `EXPIRED` and a pending
`CANCELLATION` `SUPERSEDED`, and increments `version`. The settlement job then releases the
hold. A failure stops the run and logs `ORDER_EXPIRY_FAILED` with the order ID. The
`CANCELLED` history entry becomes an `OrderCancelled` event (below).

Manual check run by Zi Yi on 2026-10-18 against the root Compose stack, with each order's window
moved into the past in SQL: an expired `PENDING` order was cancelled (`reason: EXPIRED`) and its
credits returned; an expired `ACCEPTED` order was cancelled and its pending timing change became
`EXPIRED`; an expired `ARRIVED` order stayed `ARRIVED`; no `ORDER_EXPIRY_FAILED` was logged. All
passed.

**Edit** body: `version` (required) plus at least one of `orderDescription`,
`pickupLocationId`, `deliveryLocationId`, `windowStart`, `windowEnd`. `creditOffer` and every
other field are rejected. A changed location is re-fetched (must be `ACTIVE`) and its snapshot
replaced; pickup hours are rechecked whenever pickup or timing changes. Writes `EDITED` history
with `changeDetails` = `{ field: { from, to } }` and increments `version`.

**Accept** body: `{ "version": n }`. One conditional `UPDATE` (still `PENDING`, unassigned,
unexpired, not the caller's own, same version), so of several couriers accepting at once exactly
one wins. The partial unique index stops a courier holding two active orders. Writes
`ACCEPTED` history and increments `version`. The `OrderAccepted` event is Phase D.

**Lifecycle steps** (`pick-up`, `start-delivery`, `arrive`) and **cancel** take `{ "version": n }`
and return the order. Each is one conditional `UPDATE` on the expected status and version, so a
repeated or concurrent request gets 409 and writes no second history entry. Lifecycle steps
refuse an order whose window has ended (expiry wins, plan §6); the expiry worker cancels it
within about 60 s. `arrive` also marks a pending `TIMING_CHANGE` `SUPERSEDED`, since `ARRIVED` allows no timing
changes. History actions are `PICKED_UP`, `IN_PROGRESS` and `ARRIVED`.

Cancel works on `PENDING` only, even after the window has ended. It writes `CANCELLED` history
with `changeDetails.reason = REQUESTER_CANCELLED`. Accepted orders need a `CANCELLATION`
proposal.

**Confirmations.** Body `{ "kind": "CANCELLATION" }`, `{ "kind": "COMPLETION" }` or
`{ "kind": "TIMING_CHANGE", "windowStart", "windowEnd" }`. There is no `version`, since a
proposal does not change the order. The proposer's response is recorded as `ACCEPTED`, the
other participant's as `PENDING`. One pending proposal per order (409 `CONFIRMATION_PENDING`).

| Kind | Who proposes | Order status | Window ended? |
|---|---|---|---|
| `TIMING_CHANGE` | requester | `ACCEPTED`, `PICKED_UP`, `IN_PROGRESS` | refused; pickup hours checked only in `ACCEPTED` |
| `CANCELLATION` | either | `ACCEPTED` to `ARRIVED` | allowed |
| `COMPLETION` | either | `ARRIVED` | `ARRIVED` never expires |

Respond body: `{ "response": "ACCEPTED" | "REJECTED" }`; returns the confirmation. The order and
proposal rows are locked and rechecked in one transaction, so two approvals at once finalize once.
A rejection resolves the proposal as `REJECTED` and leaves the order alone. An approval resolves
it as `APPROVED`, increments the order's `version` and writes history with the approver as actor:

- `TIMING_CHANGE` → new window; `EDITED` with `{ windowStart, windowEnd: { from, to }, confirmationId }`.
- `CANCELLATION` → `CANCELLED` with `{ reason: MUTUAL_CANCELLATION, confirmationId }`.
- `COMPLETION` → `COMPLETED` with `{ confirmationId }`.

A `TIMING_CHANGE` answered once the current window (or its proposed one) has ended becomes
`EXPIRED` and the respond call returns 409.

**Credits:** the settlement job releases every `CANCELLED` order and pays the courier for every
`COMPLETED` one (see [Create](#http-api) above), so requester and mutual cancellations and
completions settle within about 10 s.

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | bad body/query/ID, unknown field, invalid or ended window |
| 400 | `PICKUP_CLOSED` | window misses the pickup location's opening hours |
| 401 | `TOKEN_INVALID` | missing, invalid or expired token |
| 401 | `SERVICE_KEY_INVALID` | `/internal/**` without the right `X-Service-Key` |
| 403 | `FORBIDDEN` | not a participant; not the requester or assigned courier the action needs; accepting your own |
| 404 | `NOT_FOUND` | unknown order or location |
| 409 | `VERSION_CONFLICT` | `version` is stale; reload the order |
| 409 | `INVALID_STATE` | order in the wrong status for the action, already taken, or its window ended; proposal already resolved or expired |
| 409 | `COURIER_BUSY` | courier already has an active order |
| 409 | `LOCATION_INACTIVE` | a chosen location is `INACTIVE` |
| 409 | `INSUFFICIENT_CREDITS` | Credit refused the reservation |
| 409 | `CONFIRMATION_PENDING` | the order already has a pending proposal |
| 503 | `SERVICE_UNAVAILABLE` | User Service keys, Supplier or Credit unreachable; create stalled over 30 s |

**Internal active-order lookup** (for the User Service's deactivation check):
`GET /internal/orders/users/:userId/active` with header `X-Service-Key: <ORDER_SERVICE_KEY>`
(no user token; the gateway never routes `/internal/**`) returns
`{ "userId": "…", "hasActiveOrders": true }`: true while the user is requester or courier on
any order not `COMPLETED` or `CANCELLED`. 401 `SERVICE_KEY_INVALID` for a missing or wrong key.
Design by Zi Yi (2026-10-18); the User Service does not call it yet.

**`order.events`** (Notification): each state change's history entry is published, keyed by
`orderId`, as `{ eventId, eventType, occurredAt, data: { orderId, requesterId, courierId, status,
reason? } }`. Types: `OrderAccepted`, `OrderPickedUp`, `OrderInProgress`, `OrderArrived`,
`OrderCompleted`, `OrderCancelled` (with `reason` `REQUESTER_CANCELLED`, `MUTUAL_CANCELLATION` or
`EXPIRED`). Nothing for create, edits or a create cancelled for credit. The publisher
(`OrderEvents.publishPending`, every second from `main.ts`) sends unpublished entries oldest
first and sets `order_history.published_at` once Kafka stores each one; a failure stops the run
and logs `ORDER_EVENT_PUBLISH_FAILED`, and the next run resends. `eventId` is the history
entry's ID, so a resend carries the same ID. Full contract: [AGENTS.md](AGENTS.md) "History
and events". Design by Zi Yi (2026-10-18), pending the team and the Notification owner.

Manual check run by Zi Yi on 2026-10-19 against the root Compose stack, reading the topic with
`kafka-console-consumer.sh`: the lookup returned `SERVICE_KEY_INVALID` with no key, a wrong key or
only a user token, `VALIDATION_ERROR` for a non-UUID, `true` for the requester and the courier
while an order was open and `false` once none was. A full lifecycle published `OrderAccepted`,
`OrderPickedUp`, `OrderInProgress`, `OrderArrived` and `OrderCompleted` in order, keyed by the
order ID, with `eventId`s matching the history entries and no event for the create. A requester
cancellation and an expiry each published one `OrderCancelled` (`REQUESTER_CANCELLED`, courier
`null`; `EXPIRED`). With Kafka stopped, a cancellation still succeeded, `ORDER_EVENT_PUBLISH_FAILED`
was logged and `published_at` stayed empty; after Kafka restarted the event was published and
`published_at` set, and no other publish failures were logged. All passed.

**Known limitation (Credit owner to handle):** Credit dead-letters a `ReleaseCredits` for an
order it has no hold for (`HOLD_NOT_FOUND`), which happens when a reserve timed out before Credit
saved anything. And if that release arrives while a slow reserve is still running inside Credit,
the reserve can land afterwards and stay held. Both close if Credit records a release for an
unknown order (a `RELEASED` marker). Recorded in `credit-service/AGENTS.md` open items.

Run locally (after `npm ci` in `order-service/`) with the five `ORDER_DB_*` settings,
`ORDER_JWKS_URL`, `ORDER_SUPPLIER_URL`, `ORDER_CREDIT_URL`, `ORDER_CREDIT_SERVICE_KEY`,
`ORDER_KAFKA_BROKERS` (e.g. `localhost:9094`, the shared broker in `infra/kafka/`) and
`ORDER_SERVICE_KEY` (≥ 32 characters) set:

```powershell
npm run build
npm start
```

In Compose, `ORDER_CREDIT_SERVICE_KEY` comes from `CREDIT_SERVICE_KEY` in the root `.env`;
the service refuses to start without it, or without `ORDER_SERVICE_KEY` (also from the root
`.env`; e.g. `openssl rand -hex 32`). Compose sets `ORDER_KAFKA_BROKERS=kafka:9092` and starts
the service after `kafka-init` has created the topics.

`npm test` runs the unit tests (no database needed). The Compose test command above runs
the unit tests and all PostgreSQL integration tests, including the HTTP tests in
`src/test/orders.api.test.ts` (which fake Supplier, Credit and the Kafka producer, so no broker
is needed; check real delivery by hand, below).

Verification on 2026-10-15: all 42 tests passed in `compose.test.yaml` (12 unit, 14 database,
16 HTTP); the container refused to start without `ORDER_CREDIT_SERVICE_KEY` and started with it.
After Phase C, all 53 passed (12 unit, 14 database, 27 HTTP). After Phase D step 1 (2026-10-17),
all 53 passed again, and the runtime image loaded the Kafka client. After the expiry worker,
56 passed; after `order.events` and the active-order lookup, 61 passed. After the Phase E tests
(2026-10-19), 64 passed.

**Manual check with Credit (not automated):** run the root `docker compose up`, create an order,
take it through to `COMPLETED`, and within about 10 s the courier's `GET /credits/:userId`
`available` rises by the offer and the requester's `reserved` drops by it. Cancel another and the
requester's `available` comes back. Kafka UI (http://localhost:8085) shows the commands on
`credit.commands`, and `credit.commands.dlt` stays empty.

Manual check run by Zi Yi on 2026-10-18 against the root Compose stack: completion (courier paid),
cancellation (requester's credits returned), insufficient credits (no command sent) and a
cancellation while Kafka was stopped (settled after it restarted) all passed.

## Test with Postman

Import `postman/order-service.postman_collection.json` and start the whole stack
(`docker compose up -d --build`; the gateway does not route `/orders` yet, so the requests go
straight to each service). Set `emailA` / `emailB` / `password` to two verified test accounts
(A requests, B delivers; B must have no active order) and, for folder 5, `serviceKey` to your
`ORDER_SERVICE_KEY`. Run **0. Setup** first, then any folder top to bottom: each creates its own
order and carries `orderId` and `version` from request to request. Access tokens last 15 minutes,
so run 0 again on a 401. A full run needs A to have at least 5 available credits (a
cancelled order's credit returns about 10 s later); a `409 INSUFFICIENT_CREDITS` on a create
means A has run low, so swap the two accounts. Folders: 1 full order (with the courier's balance before and 11 s after
completion), 2 requester and mutual cancellation, 3 edit, 4 errors, 5 internal lookup. Background
jobs (expiry, `order.events`) have no endpoint; check those as described above.
