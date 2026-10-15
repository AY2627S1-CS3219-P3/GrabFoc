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
-->

# Order Service

Database foundation for #50 (under parent #64) plus Phases A and B of `docs/order-service-plan.md`: a NestJS server with authenticated read, create, edit and accept endpoints (see [HTTP API](#http-api)). Lifecycle transitions, confirmations, cancellation and Kafka are not implemented yet. The schema is in `migrations/001_init.sql`, including the `AWAITING_CREDIT` state, the `CREDIT_RESERVED` history action and `orders.credit_released_at` for the creation flow. Read [AGENTS.md](AGENTS.md) for requirements.

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
- Confirmation initiation approved on 2026-10-13: after acceptance, requester initiates timing changes; either requester or assigned courier initiates mutual cancellation or completion (completion only in ARRIVED). Initiation records the initiator response as ACCEPTED and the other response as PENDING. The order changes only after both approve. PENDING cancellation remains requester-only without a mutual proposal; chat messages do not constitute acknowledgement.
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

For Zi Yi's revised creation flow (2026-10-15, **[Proposed]**), `001_init.sql` also has the `AWAITING_CREDIT` state (no courier), the `CREDIT_RESERVED` history action and a nullable `orders.credit_released_at TIMESTAMPTZ`. The column default stays `PENDING`; the API inserts `AWAITING_CREDIT` explicitly. No new indexes.

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
- Credit communication/recovery contract: root currently records synchronous reserve/transfer/release; meeting's asynchronous proposal is not yet approved.
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

Tests cover schema/defaults, reference and confirmation constraints, all eight indexes,
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

Every route needs `Authorization: Bearer <access token>` from the User Service, verified locally
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
| `GET /orders/:orderId/history` | requester or assigned courier | `{ items }`, oldest first |

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
   (`changeDetails.reason = CREDIT_NOT_RESERVED`, no actor) and Order calls
   `POST /internal/credits/release`, since a timed-out reserve may still have saved a hold.

A clean-up job runs every 10 s (`OrdersService.cleanUpCredits`, started in `main.ts`): it cancels
`AWAITING_CREDIT` orders older than 30 s and calls release for every `CANCELLED` order without
`credit_released_at`, setting it when Credit answers 200 or 404. It stops at the first failed
release and logs a `CREDIT_CLEANUP_FAILED` line with the order ID. Flow revised by Zi Yi on
2026-10-15 (`docs/order-service-plan.md` §4); **[Proposed]** until the team and Credit owner confirm.

**Edit** body: `version` (required) plus at least one of `orderDescription`,
`pickupLocationId`, `deliveryLocationId`, `windowStart`, `windowEnd`. `creditOffer` and every
other field are rejected. A changed location is re-fetched (must be `ACTIVE`) and its snapshot
replaced; pickup hours are rechecked whenever pickup or timing changes. Writes `EDITED` history
with `changeDetails` = `{ field: { from, to } }` and increments `version`.

**Accept** body: `{ "version": n }`. One conditional `UPDATE` (still `PENDING`, unassigned,
unexpired, not the caller's own, same version), so of several couriers accepting at once exactly
one wins. The partial unique index stops a courier holding two active orders. Writes
`ACCEPTED` history and increments `version`. The `OrderAccepted` event is Phase D.

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | bad body/query/ID, unknown field, invalid or ended window |
| 400 | `PICKUP_CLOSED` | window misses the pickup location's opening hours |
| 401 | `TOKEN_INVALID` | missing, invalid or expired token |
| 403 | `FORBIDDEN` | not a participant; editing someone else's order; accepting your own |
| 404 | `NOT_FOUND` | unknown order or location |
| 409 | `VERSION_CONFLICT` | `version` is stale; reload the order |
| 409 | `INVALID_STATE` | order not `PENDING`, already taken or expired |
| 409 | `COURIER_BUSY` | courier already has an active order |
| 409 | `LOCATION_INACTIVE` | a chosen location is `INACTIVE` |
| 409 | `INSUFFICIENT_CREDITS` | Credit refused the reservation |
| 503 | `SERVICE_UNAVAILABLE` | User Service keys, Supplier or Credit unreachable; create stalled over 30 s |

**Known limitation:** Credit's release currently returns 404 for an order it has no hold for.
If that release arrives while a slow reserve is still running inside Credit, the reserve can
land afterwards and stay held. Closing this needs Credit to save a `RELEASED` marker on that
404 (**[Proposed]**, Credit owner).

Run locally (after `npm ci` in `order-service/`) with the five `ORDER_DB_*` settings,
`ORDER_JWKS_URL`, `ORDER_SUPPLIER_URL`, `ORDER_CREDIT_URL` and `ORDER_CREDIT_SERVICE_KEY` set:

```powershell
npm run build
npm start
```

In Compose, `ORDER_CREDIT_SERVICE_KEY` comes from `CREDIT_SERVICE_KEY` in the root `.env`;
the service refuses to start without it.

`npm test` runs the unit tests (no database needed). The Compose test command above runs
the unit tests and all PostgreSQL integration tests, including the HTTP tests in
`src/test/orders.api.test.ts` (which fake Supplier and Credit).

Verification on 2026-10-15: all 42 tests passed in `compose.test.yaml` (12 unit, 14 database,
16 HTTP); the container refused to start without `ORDER_CREDIT_SERVICE_KEY` and started with it.
