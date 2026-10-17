<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
Scope: Revised the order-creation flow (AWAITING_CREDIT, cancel and release on failure, clean-up job) across §0–§10 at Zi Yi's direction.
Author review: Reviewed
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
Scope: Recorded Zi Yi's credit settlement decision (§0, §4, §9) and the Phase C expired-window rule (§6).
Author review: Reviewed
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-17
Scope: Replaced the settlement events with Credit's commands (§0, §4, §5, §6 table, §8, §9) at Zi Yi's direction.
Author review: Reviewed
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
Scope: Ticked the expiry worker in §8 Phase D.
Author review: Reviewed
-->

# GrabFoC Order Service — Implementation Plan

**Status:** Team decisions consolidated, 14 October 2026. Creation flow revised by Zi Yi, 15 October 2026 (§4); confirm with the team and the Credit owner.  
**Scope:** CS3219 D1 Order Service functional requirements (OSFR1–OSFR6) and D3 integration/demo.  
**Approach:** Deliver a small, working NestJS service on top of the **existing** PostgreSQL migration. No new tables and **no dedicated repeated-order-creation/idempotency mechanism for now**. `001_init.sql` gains one order state and one column for the creation flow; the `orders` table itself records which credit releases are still owed (no separate outbox table).

## 0. Decisions at a glance

| Topic | Decision |
|---|---|
| Stack | NestJS, TypeScript, PostgreSQL, `pg` parameterized SQL, strict Zod validation |
| Database | Existing `orders`, `order_history`, `order_confirmations` tables; preserve existing constraints/indexes |
| API conventions | camelCase JSON; User Service error envelope `{ "error": { "code", "message", "details" } }` |
| Authentication | Independently verify User Service RS256 JWT via JWKS; use JWT `sub` as user ID and `role` for role checks |
| Requester/courier roles | Both are ordinary `USER` accounts; acting as requester/courier is determined by the order relationship, not a special JWT role |
| Creation | Validate Supplier locations and timing, save the order as `AWAITING_CREDIT`, reserve credits over HTTP, then open it as `PENDING`. A failed reservation cancels the order and releases any hold (§4) |
| Timing | Default `window_end = window_start + 24 hours`; **no maximum custom window duration**; `window_end > window_start` |
| Pickup hours | Before PICKED_UP, requested timing window must **overlap** pickup location operating hours; no restriction when hours are absent. On changes after PICKED_UP, pickup hours no longer constrain the window |
| Delivery hours | **No opening-hours restriction** on delivery location |
| Location availability | At creation/location changes, both location IDs must exist and be ACTIVE; timing changes also revalidate location state as appropriate |
| Supplier integration | Direct asynchronous HTTP calls (`async/await`), not request-response Kafka events; persist location names/coordinates as snapshots |
| Order editing | Only requester can edit PENDING order directly; no edits to credit offer after creation; after acceptance timing changes require both participants' confirmation |
| Courier | Cannot accept own order; each courier may hold only one active order at a time; no requester active-order limit beyond credit eligibility |
| Confirmation | At most **one PENDING proposal per order, across all kinds**; initiator auto-accepts; other participant approves/rejects |
| Completion | ARRIVED → COMPLETED only after requester and courier accept a COMPLETION confirmation |
| Cancellation | Requester may immediately cancel PENDING; accepted orders normally require mutual confirmation; system cancellations bypass mutual confirmation |
| Expiry | Every 60 seconds, cancel past-`window_end` orders in PENDING/ACCEPTED/PICKED_UP/IN_PROGRESS; **do not expire ARRIVED** |
| Voluntary user deactivation | User Service rejects deactivation if user is requester or courier on any ongoing order; Order Service provides an active-order lookup for this |
| Administrative suspension | User Service emits `UserSuspended`; Order Service cancels all affected nonterminal orders, including ARRIVED |
| Supplier deactivation | Supplier Service emits `SupplierDeactivated`; Order Service cancels all affected nonterminal orders, including ARRIVED |
| Broker | **Kafka**; broker infrastructure/setup is owned by a teammate, not the Order Service implementer |
| Credit | Synchronous HTTP **reserve** (Credit Service atomically checks sufficiency and reserves); Order sends Credit's `TransferCredits` / `ReleaseCredits` **commands** on `credit.commands` for transfer and release (Zi Yi, 2026-10-17, replacing the 2026-10-15 events decision). Root `AGENTS.md` §3 records this |
| Credit failures | Order cancels a create whose reservation failed and sends `ReleaseCredits` (none for insufficient credits); a background job every 10 s resends commands Kafka has not stored and cancels creates stuck in `AWAITING_CREDIT` for over 30 s. The Credit owner handles releases for unknown orders (§4) |
| Notification | Notification Service consumes Order events; notify other party when a confirmation needs action (event to agree on) |
| User status checks | No live User Service status lookup before each Order API call for now; rely on JWT and suspension event handling |
| Creation retries | **Deferred**: no idempotency key store, Redis dependency, or duplicate-create handling for now |
| Admin order listing | Deferred |

## 1. Existing database foundation — do not redesign

`order-service/migrations/001_init.sql` already defines:

- **`orders`:** UUID ID, description, requester/courier UUIDs, integer pickup/delivery location IDs, location name and latitude/longitude snapshots, positive integer credit offer, status, timing window, timestamps and optimistic `version` (default 1).
- **`order_history`:** order ID, actor ID, action, previous/new statuses, JSONB change details and occurrence timestamp.
- **`order_confirmations`:** `TIMING_CHANGE`, `CANCELLATION`, `COMPLETION`; initiator, optional proposed window, each participant's response, proposal status and resolution timestamps.
- **Indexes/constraints:** status and requester/courier lookups; `orders_one_active_courier_idx` for a courier's maximum one active order; `order_confirmations_one_pending_idx` for one pending proposal per order; status/assignment/window validation.

Supported order statuses: `PENDING`, `ACCEPTED`, `PICKED_UP`, `IN_PROGRESS`, `ARRIVED`, `COMPLETED`, `CANCELLED`, plus `AWAITING_CREDIT` for the creation flow. `001_init.sql` also has the `CREDIT_RESERVED` history action and `orders.credit_settled_at` (set once Kafka stores the order's transfer or release command; `credit_released_at` before Phase D).

The migration provides schema constraints but **does not automatically increment version, write history, run expirations or publish events**. Implement those in NestJS. A cancelled order may retain an assigned courier ID as historical information. `order_history.actor_id = NULL` for system actions; store the cause in `change_details`.

## 2. Functional behavior and state transitions

| From | Action / actor | To | Guard / side effect |
|---|---|---|---|
| — | Create / authenticated requester | AWAITING_CREDIT | Validate locations and pickup-hours overlap; save snapshots; CREATED history. Not visible to couriers |
| AWAITING_CREDIT | Credit reserve succeeds | PENDING | CREDIT_RESERVED history; only now listed as available |
| AWAITING_CREDIT | Reserve refused, failed or timed out; or stuck > 30 s (clean-up job) | CANCELLED | System cancellation, `reason: CREDIT_NOT_RESERVED`; `ReleaseCredits` command (none for insufficient credits); no `OrderCancelled` event |
| PENDING | Accept / courier | ACCEPTED | Unexpired, no courier already assigned, different from requester, courier has no other active order; ACCEPTED history and event |
| ACCEPTED | Mark picked up / assigned courier | PICKED_UP | Correct current state/version; history and `OrderPickedUp` |
| PICKED_UP | Start delivery / assigned courier | IN_PROGRESS | Correct current state/version; history and `OrderInProgress` |
| IN_PROGRESS | Arrive / assigned courier | ARRIVED | Correct current state/version; history and `OrderArrived` |
| ARRIVED | Both approve COMPLETION proposal | COMPLETED | Atomically resolve proposal, change order and write history; the settlement job sends `TransferCredits`; `OrderCompleted` for notifications |
| PENDING | Cancel / requester | CANCELLED | Direct cancellation; history and `OrderCancelled` |
| ACCEPTED, PICKED_UP, IN_PROGRESS, ARRIVED | Both approve CANCELLATION proposal | CANCELLED | Atomically resolve proposal; history and `OrderCancelled` |
| PENDING, ACCEPTED, PICKED_UP, IN_PROGRESS | Expiry worker, `now >= window_end` | CANCELLED | System cancellation; no acknowledgement needed; history and `OrderCancelled` |
| Any nonterminal state (including ARRIVED) | Relevant `UserSuspended` / `SupplierDeactivated` | CANCELLED | System cancellation; supersede pending confirmation; history with reason; publish `OrderCancelled` |

`COMPLETED` and `CANCELLED` are terminal. Invalid transitions and stale versions return `409 Conflict`. No ordinary field edits are allowed in ARRIVED.

### Timing windows and Supplier operating hours

- Default: `window_start` is the creation time and `window_end` is 24 hours later, unless valid values are supplied; no maximum window duration.
- Validate `window_end > window_start` and reject a window already ended at the point the operation is finalized. A future `window_start` is allowed.
- For **creation, direct PENDING edits and proposed timing changes before PICKED_UP**, fetch current pickup location operating hours and ensure the proposed window overlaps at least one opening interval. Account for operating hours that cross midnight; hours are optional.
- After PICKED_UP, do not apply pickup opening-hour restrictions to timing changes. **Delivery location opening hours never restrict the window.**
- A proposed later `window_end` does not rescue a proposal if the *current* window expires before approval; worker cancellation still uses the original stored end time until both approve.
- Order Service uses the Supplier IDs and stored snapshots for history; snapshot details do not automatically change when Supplier metadata changes.

**Implementation note:** A time-window overlap is a scheduling eligibility rule, not proof that pickup can occur at a specific minute. Avoid adding routing/travel-time calculations in the initial scope.

### Confirmation workflow

1. Create a proposal in `order_confirmations`. The initiator's response is `ACCEPTED`, the other participant's `PENDING`, and proposal `status = PENDING`.
2. Enforce only one pending confirmation per order through the existing partial unique index.
3. The remaining participant responds `ACCEPTED` or `REJECTED`. On rejection, proposal is `REJECTED` and order remains unchanged.
4. On acceptance, **within one DB transaction**, lock and recheck order and confirmation, validate preconditions, set both responses accepted, resolve proposal `APPROVED`, perform the applicable order change, increment version, and write history.
5. `TIMING_CHANGE`: either participant initiates after acceptance (while timing changes are still allowed), the other confirms (requester-only until 2026-10-16). `CANCELLATION`: either participant initiates after acceptance. `COMPLETION`: either participant initiates in ARRIVED.
6. Timing proposals become `EXPIRED` when the current window expires; any remaining pending proposal becomes `SUPERSEDED` when the order is cancelled by a system action.
7. Only order changes increase `orders.version`; proposal creation, a partial response and rejection do **not** increase the order's version.

For COMPLETION, the courier can initiate after arrival, and the requester acknowledges (or vice versa); **only the second approval** causes `ARRIVED → COMPLETED` and `OrderCompleted`.

## 3. HTTP API plan

All protected routes validate JWT. IDs for requester/courier are derived from `sub`, never trusted from client-submitted identity fields. Bodies use camelCase; DB columns remain snake_case.

| Endpoint | Permission / behavior |
|---|---|
| `POST /orders` | USER creates own order; validate Supplier locations and timing; save AWAITING_CREDIT, reserve credits over HTTP, return the PENDING order (201) |
| `GET /orders/available` | Authenticated USER; list unexpired PENDING orders, excluding caller's own; pagination |
| `GET /orders/mine` | Requester's own orders, including history statuses |
| `GET /orders/assigned` | Orders assigned to caller as courier |
| `GET /orders/:orderId` | Only order requester or assigned courier; available-order detail may be exposed to eligible couriers as needed for acceptance |
| `GET /orders/:orderId/history` | Requester or assigned courier; chronological history |
| `GET /orders/:orderId/confirmations` | Requester or assigned courier; pending and resolved proposals |
| `PATCH /orders/:orderId` | Requester only, PENDING only; description, location(s), timing; cannot change credit offer; `version` required |
| `POST /orders/:orderId/accept` | Courier; PENDING only; `version` required; enforce distinct parties and one active order per courier |
| `POST /orders/:orderId/pick-up` | Assigned courier; ACCEPTED → PICKED_UP; `version` required |
| `POST /orders/:orderId/start-delivery` | Assigned courier; PICKED_UP → IN_PROGRESS; `version` required |
| `POST /orders/:orderId/arrive` | Assigned courier; IN_PROGRESS → ARRIVED; `version` required |
| `POST /orders/:orderId/cancel` | Requester only; immediate cancellation while PENDING; `version` required |
| `POST /orders/:orderId/confirmations` | Participant initiates valid TIMING_CHANGE / CANCELLATION / COMPLETION proposal |
| `POST /orders/:orderId/confirmations/:confirmationId/respond` | Other participant accepts/rejects; lock/recheck and resolve transactionally |
| `GET /internal/orders/users/:userId/active` | Internal User Service caller; `{ "hasActiveOrders": true/false }` for voluntary deactivation guard |

**Illustrative request body:**

```json
{
  "orderDescription": "Pick up stationery",
  "pickupLocationId": 12,
  "deliveryLocationId": 7,
  "creditOffer": 3,
  "windowStart": "2026-10-14T09:00:00+08:00",
  "windowEnd": "2026-10-14T12:00:00+08:00"
}
```

`windowStart` / `windowEnd` may be omitted for the 24-hour default. For writes to an existing order, the client sends its last-read `version`. Suggested errors: 400 invalid data, 401 invalid/missing JWT, 403 nonparticipant or wrong actor, 404 unknown order/location as appropriate, 409 stale version, ineligible transition, or conflicting confirmation; 503 required downstream service unavailable. Always use the User Service error envelope.

**Not in initial scope:** order creation `Idempotency-Key`, Redis key storage, special network-retry duplicate suppression, admin search/listing.

## 4. Cross-service integrations

### Supplier Service — HTTP for authoritative location checks

- Call Supplier Service asynchronously over HTTP on creation, direct location edits, and timing validation where relevant.
- Check location existence/ACTIVE status, read pickup opening/closing hours, and copy `name`/`lat`/`lon` into the Order row.
- Apply pickup-hours overlap **only before PICKED_UP**; do not constrain delivery hours.
- On a `SupplierDeactivated` Kafka event carrying a **location ID**, find affected nonterminal orders whose `pickup_location_id` **or** `delivery_location_id` matches. Cancel each and emit `OrderCancelled`.
- Confirm exact URL/field naming with Supplier owner; the existing Supplier Service stores `locations.id` and exposes `GET /locations/:locationId`.

### User Service — JWT plus suspension events

- Authenticate JWT locally against User Service JWKS. A user's requester/courier mode is a UI choice, not a distinct JWT role.
- **Voluntary deactivation:** User Service checks `GET /internal/orders/users/:userId/active` and **rejects** deactivation if the user is requester or courier on any nonterminal order. User Service owns this rule. Order Service does not cancel orders merely because a user voluntarily deactivated.
- **Admin suspension:** User Service publishes `UserSuspended`; Order Service cancels affected nonterminal orders, including ARRIVED. Include requester and assigned courier matches.
- No per-action live status lookup in Order Service for the first version. A still-valid JWT may permit a brief delay before suspension propagation; document as a scope trade-off.

### Credit Service — reserve over HTTP, settle with Credit's commands

| Trigger | Credit Service operation | Transport |
|---|---|---|
| Creating an order | **Check available credits and reserve** in a single atomic operation keyed by `orderId` | Synchronous HTTP, `POST /internal/credits/reserve` |
| Creating an order failed (not insufficient credits) | Release any hold for that `orderId` | `ReleaseCredits` on `credit.commands` |
| Order `COMPLETED` | Transfer existing reservation to courier | `TransferCredits` on `credit.commands` |
| Order `CANCELLED` (requester, mutual, expiry, deactivation, suspension) | Release existing reservation back to requester | `ReleaseCredits` on `credit.commands` |

Credit Service guards against duplicate transfer/release. Order Service must only make a new order available once the reservation has succeeded.

**Creation flow (revised by Zi Yi, 15 October 2026):**

1. Save the order as `AWAITING_CREDIT` with `CREATED` history, in a short transaction.
2. Call `reserve` (synchronous HTTP, 5 s timeout, no transaction open).
3. Success → move `AWAITING_CREDIT → PENDING` (only if still `AWAITING_CREDIT`), with `CREDIT_RESERVED` history, and return 201.
4. Refused, failed or timed out → move the order to `CANCELLED` (system action, `reason: CREDIT_NOT_RESERVED`), send `ReleaseCredits` once, and return the error. A timed-out reserve may still have saved a hold, so Order releases; only `INSUFFICIENT_CREDITS` (Credit kept nothing) is marked settled without a command.
5. Every 10 s, a background job cancels `AWAITING_CREDIT` orders older than 30 s (their request died) and sends the command for every `COMPLETED`/`CANCELLED` order with no `credit_settled_at`, setting it once Kafka stores the command.
6. **Credit owner to handle:** a `ReleaseCredits` for an unknown order is dead-lettered (`HOLD_NOT_FOUND`), and a reserve still running inside Credit can land after it and stay held. Credit recording a release for an unknown order (a `RELEASED` marker) closes both.

**Settling cancellations and completions (Zi Yi, 17 October 2026):** commands for settlement, events for notification. The step-5 job is the outbox: it sends Credit's command for every finished order not yet marked, so a crash between commit and send cannot lose a transfer or release, and Credit ignores the repeats. `order.events` (Notification) is separate and comes later in Phase D.

This is a small saga with a compensating action (release), and the `orders` table acts as its outbox. It covers a lost or slow Credit reply, Credit being down, Order's own commit failing and Order crashing mid-create.

### Notification Service

- Independently consume Order events for status notifications and final cancellations/completions.
- **Proposed** extra event: `OrderConfirmationRequested`, sent when the other participant must approve a timing change, cancellation, or completion. Agree with Notification Service on the exact name/content; it must not be the only way the participant learns of pending confirmations (they can also read the Order API).

## 5. Kafka plan — small shared event contract

**Responsibility split:** A teammate owns setting up and configuring the shared Kafka broker (deployment, connectivity, and broker-level configuration). **Order Service owns only its Kafka application integration**: producing Order events, consuming `UserSuspended`/`SupplierDeactivated`, choosing keys, handling consumer groups/offset acknowledgements and duplicate events, and integration tests. Coordinate connection details (`bootstrap.servers`, authentication/TLS if applicable), topic provisioning/ownership, and environment variables with the Kafka teammate. Do **not** build a separate broker or take ownership of Kafka infrastructure in this Order Service work plan.

**Proposed topics** (confirm names with other owners):

| Topic | Producer | Consumers | Kafka key |
|---|---|---|---|
| `order.events` | Order Service | Notification Service | `orderId` |
| `credit.commands` (exists; Credit owns it) | Order Service | Credit Service | `orderId` |
| `user.events` | User Service | Order Service | `userId` |
| `supplier.events` | Supplier Service | Order Service | location ID as a string |

Settlement does not use `order.events` (Zi Yi, 2026-10-17): Credit reads only its own `credit.commands`. Use `orderId` as key for per-order ordering within a partition. Each handler should recheck persisted state so duplicate messages do not repeat an order transition or credit operation.

**Common payload:**

```json
{
  "eventId": "c183daf9-2d1a-4a45-85a4-ec20e3380f92",
  "eventType": "OrderCancelled",
  "occurredAt": "2026-10-14T00:30:00Z",
  "data": {
    "orderId": "18d87f9a-11da-4b5b-8151-ce703a6eaa85",
    "requesterId": "d32646aa-3d22-40f5-ae66-8ecad6da320d",
    "courierId": "0a6255be-502f-4271-937d-c5e6958c15d0",
    "reason": "USER_SUSPENDED"
  }
}
```

- For `OrderCompleted`: `data` includes `orderId`, `requesterId`, `courierId`; Notification reads it; Credit settles from `TransferCredits` and uses the saved reservation amount.
- For `OrderAccepted`, `OrderPickedUp`, `OrderInProgress`, `OrderArrived`: same order/participant identifiers (courier non-null once accepted).
- For `OrderCancelled`: `reason` may be `REQUESTER_CANCELLED`, `MUTUAL_CANCELLATION`, `EXPIRED`, `USER_SUSPENDED`, or `SUPPLIER_DEACTIVATED`; `courierId` can be null for a never-accepted order.
- For `UserSuspended`: `{ "eventId": "uuid", "eventType": "UserSuspended", "occurredAt": "ISO-8601", "data": { "userId": "uuid" } }`.
- For `SupplierDeactivated`: same envelope, `data: { "locationId": 12 }` (use Supplier's actual location ID, **not** a separate supplier-account ID).

**Reliability for initial scope:** Use consumer groups, log failures, process messages with state guards and commit Kafka offsets only after successful handling. Basic retry/error reporting should be agreed with owners. No transactional outbox now: an Order DB commit followed by publication failure can leave an unpublished event; document and demonstrate this limitation rather than claiming exactly-once or cross-service atomicity.

## 6. Concurrency, integrity and audit rules

- `orders.version` starts at 1 and **increments by 1 on every successful update to the order** (field edit, acceptance, lifecycle transition, approved timing change, completion, cancellation). Reads and proposal-only operations leave it unchanged.
- Each write to an order must check the expected version and eligible old status; update order and insert history **in the same PostgreSQL transaction**.
- Courier accept uses a conditional update with `status='PENDING'`, no courier, unexpired window, matching version; unique partial index prevents the same courier holding multiple active orders.
- Confirmation approval uses row locks/guarded updates for the **order and confirmation**. Initiator is already accepted, so two almost-simultaneous responses are usually duplicate submissions from the remaining party; one may finalize, the other must not finalize again.
- Background expiry rechecks status and deadline within its transaction, then changes status, version, history, and pending-proposal resolution consistently.
- Until that worker exists (Phase D), an order past `window_end` refuses lifecycle steps and timing changes; requester cancellation of PENDING and mutual cancellation stay allowed (Zi Yi, 15 October 2026).
- Deactivation/suspension events may overlap with user actions. The consumer must lock/recheck order status, avoid repeat cancellation and supersede pending confirmations.
- Publish Order events **only for successful state changes**; a failed/stale request must not add duplicate history or request duplicate credit side effects.

### Key edge cases and handling status

| Case | Status | Method of handling |
|---|---|---|
| Two couriers attempt same PENDING order | DB support exists; handler needed | Conditional status/version update; only one assignment succeeds |
| Same courier attempts two active orders | DB enforced | Existing `orders_one_active_courier_idx`, translate DB conflict to 409 |
| Courier accepts own order | DB enforced, plus API guard | Existing distinct-parties check; reject earlier in service |
| Duplicate PICKED_UP / other transition | Handler needed | State + version guard; second call returns 409; no duplicate history/event |
| Simultaneous responses to same confirmation | DB supports; handler needed | Lock order/confirmation in one transaction, recheck pending status, finalize once |
| Two different pending proposals on same order | DB enforced | Existing `order_confirmations_one_pending_idx` |
| Expiry races with acceptance or timing approval | Handler needed | Conditional updates/transactional locks; `now >= stored window_end` wins when eligible |
| Supplier/User deactivation event delivered twice | Handler needed | Cancel only nonterminal orders, do not repeat state/event for already cancelled orders |
| TransferCredits/ReleaseCredits delivered or sent twice | Credit owner | Credit hold keyed by order and idempotent terminal state handling |
| Order DB commits but Kafka publish fails | Known limitation | Log/retry where feasible; no outbox in this iteration |
| Same order creation POST is retried | **Out of scope** | No creation-idempotency implementation now |
| Credit reserves but its reply is lost, or Order fails before opening the order | Handled | Order cancels and releases; clean-up job retries the release and cancels creates stuck in `AWAITING_CREDIT` |
| Release reaches Credit before a slow reserve finishes, or for an order with no hold | **Credit owner to handle** | Credit records a release for an unknown order (`RELEASED` marker) instead of dead-lettering `HOLD_NOT_FOUND` |
| Suspended user's JWT remains valid before event handled | Known limitation | No live User-status check on every action in this iteration |

## 7. Suggested NestJS implementation structure

```text
order-service/
  src/
    main.ts
    app.module.ts
    auth/                 # JWT/JWKS verification, guards, caller identity
    db/                   # pg Pool, transaction helper, existing migrations
    orders/
      orders.controller.ts
      orders.service.ts
      orders.repository.ts
      orders.schemas.ts   # Zod request/query schemas
    confirmations/
      confirmations.controller.ts
      confirmations.service.ts
    integrations/
      supplier.client.ts  # HTTP location validation
      credit.client.ts    # HTTP reservation
    events/
      kafka.producer.ts
      kafka.consumer.ts   # UserSuspended, SupplierDeactivated
    expiry/
      expiry.worker.ts    # 60-second eligible-order scan
  migrations/001_init.sql # already exists
  test/
```

Keep modules thin: controllers authenticate/validate; services enforce rules; repositories execute parameterized SQL and transactions. Share status-transition guards instead of duplicating them among HTTP handlers and the expiry/event consumers.

## 8. Delivery phases and tests

### Phase A — NestJS and basic access

- [ ] Bootstrap NestJS around existing database connection/migration setup.
- [ ] Implement JWKS JWT verification, Zod validation, standard errors and request logging.
- [ ] Implement `GET /orders/available`, `/mine`, `/assigned`, `/:id`, `/:id/history` with participant authorization and pagination.
- [ ] Add basic health/readiness checks and environment configuration.

### Phase B — Create/edit/accept

- [ ] Supplier HTTP client: ACTIVE locations, snapshot fields, pickup-hours overlap (including overnight hours), delivery-hours unrestricted.
- [ ] Credit HTTP reservation request as part of create flow; agree minimal reservation result contract with Credit team.
- [ ] Create flow from §4: AWAITING_CREDIT → PENDING with default/custom timing, CREATED and CREDIT_RESERVED history; cancel and release on failure; 10-second clean-up job.
- [ ] Requester-only PENDING editing with `version`, validation and EDITED history.
- [ ] Atomic courier acceptance; reject self-acceptance and second active courier assignment.

### Phase C — Lifecycle and confirmations

- [ ] PICKED_UP → IN_PROGRESS → ARRIVED handlers, assigned-courier authorization, history/version checks.
- [ ] Immediate requester cancellation for PENDING.
- [ ] TIMING_CHANGE / CANCELLATION / COMPLETION proposals and approval/rejection logic.
- [ ] ARRIVED → COMPLETED only on two-party approval; proposal resolution and history in one transaction.

### Phase D — Kafka application integration and automatic cancellation

- [x] Obtain broker bootstrap address, topic names, and access/configuration details from the teammate responsible for Kafka setup (`infra/kafka/`); do not set up the broker as part of Order Service work.
- [x] Credit settlement: `TransferCredits` / `ReleaseCredits` on `credit.commands` from the settlement job (outbox on `credit_settled_at`).
- [ ] Kafka producer for `order.events` (Notification); add the topic to `infra/kafka/topics.txt`.
- [ ] `UserSuspended` and `SupplierDeactivated` consumers; cancel affected nonterminal orders and supersede pending confirmations.
- [x] 60-second expiry worker (`expireOrders`).
- [ ] Publish `OrderCancelled` for successful expirations (with the `order.events` producer).
- [ ] Internal active-order lookup for User Service deactivation guard.
- [ ] Demonstrate Credit transfer/release from the commands and Notification consumption with other teams.

### Phase E — Verification and D3 demo

- [ ] Tests: creation/location validation/credit insufficiency, access restrictions, available/mine/assigned lists.
- [ ] Tests: valid/invalid lifecycle transitions, credit offer immutability, stale versions, histories and confirmation rules.
- [ ] Concurrency tests: two couriers accepting, same courier accepting two orders, duplicate progress, duplicate approval, expiry races.
- [ ] Kafka tests: suspension/deactivation cancellation, duplicate events, Credit/Notification both consume each relevant event.
- [ ] Tests: expiry excludes ARRIVED; no event emitted for a failed transition.
- [ ] Containerize Order Service and demonstrate a full flow with User, Supplier, Credit and Notification services using the **teammate-provisioned Kafka broker**; broker setup belongs to that teammate.

## 9. Remaining coordination (not blockers for Phase A)

1. **Kafka teammate / contracts:** teammate provisions and configures the shared Kafka broker. Obtain connection settings, access credentials (if used), topic-provisioning responsibility and readiness timeline. Separately approve final topic/event names, `locationId` spelling, consumer group IDs, and the optional `OrderConfirmationRequested` event with Supplier/User/Credit/Notification owners.
2. **Credit contract:** confirm HTTP reservation request/response and outcome semantics; Credit team owns settlement error handling and retries. Also agree (a) the `RELEASED` marker for releasing an unknown order (§4, step 6), which needs `requester_id`/`amount` to be nullable or sent with `release`; and (b) settled by Zi Yi 2026-10-17: Order sends Credit's own `TransferCredits` / `ReleaseCredits` commands, so a failed create's release never reaches Notification. The Credit owner handles (a) and the `HOLD_NOT_FOUND` dead letter for releases of unknown orders.
3. **User Service:** ensure the voluntary-deactivation active-order check and administrative `UserSuspended` publication are implemented on their side.
4. **Supplier Service:** ensure `SupplierDeactivated` is published with the correct integer **location ID**, and confirm HTTP location fields and opening-hours format.
5. **User-facing scheduling:** decide only if needed whether couriers may accept future-window orders before `window_start`; do not invent an unapproved restriction. The current agreed rule is the pickup-hours overlap check.

## 10. Scope boundaries and known limitations

**Deliberately deferred:** creation idempotency/retry suppression; Redis for Order Service; transactional outbox for Kafka events; cross-service atomic transactions (the creation flow in §4 is the only saga); per-action User Service status checks; admin order listing; new DB tables; maximum window duration; automated routing/travel-time checks.

**Important:** Credit reservation via HTTP and order creation are operations in separate services. Credit team handling of its own failures does not itself make the Order/Credit boundary atomic. Likewise, Kafka delivery does not guarantee exactly-once database effects. Capture those as D3 trade-offs and verify the basic happy path and concurrency protection.

---

**Source basis:** existing Order Service `001_init.sql` schema and decisions previously agreed for GrabFoC; CS3219 D1 backlog OSFR1–OSFR6; D3 instructions; existing Supplier and User Service work notes. API names and Kafka topic names in this plan are proposals unless explicitly approved above.
