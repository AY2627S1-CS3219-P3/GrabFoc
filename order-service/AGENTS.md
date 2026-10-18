<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-13
Scope: Record approved decisions and database-only implementation/migration/test status.
Author review: User approved the main schema and database-only plan; implementation review pending.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
Scope: Updated implementation status for Phase A and pointed the logging rule at member files.
Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
Scope: Recorded Phase B status and the revised creation flow (AWAITING_CREDIT, cancel and release, clean-up job).
Author review: Reviewed.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
Scope: Recorded Phase C status, the credit settlement decision and the expired-window rules Zi Yi confirmed.
Author review: Reviewed
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-17
Scope: Recorded Phase D step 1 (credit settlement over credit.commands) and Zi Yi's commands/events split;
resolved the root §3 conflict once root was updated.
Author review: Reviewed
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
Scope: Recorded Phase D step 2 (expiry worker) status.
Author review: Reviewed
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
Scope: Recorded Phase D step 3 status, Zi Yi's order.events and active-order lookup decisions,
and the order.events contract.
Author review: Reviewed
-->

# AGENTS.md — Order Service

_Origin: AI doc_

Read the root [AGENTS.md](../AGENTS.md) before changing this service. Its AI-policy warnings, plan approval, attribution and cross-cutting rules apply here.

**Status:** [Decided] = recorded team requirement/decision; [Proposed] = requires confirmation; [Open] = unresolved. Requirements describe intended behaviour, not completed implementation.

## Sources and ownership

_Origin: Team (supplied OSFR1–OSFR6 backlog); Restated from root AGENTS.md; AI doc (source references)_

- Parent tracker: [#64](https://github.com/AY2627S1-CS3219-P3/GrabFoc/issues/64). Schema task: [#50](https://github.com/AY2627S1-CS3219-P3/GrabFoc/issues/50).
- The source is the Order functional-requirements text supplied on 2026-10-11. IDs below preserve its traceability; this document does not reprioritise or replace it.
- Root ownership: Jian Bing — CRUD/listing; Jie Yang — acceptance/lifecycle/history. The meeting discussed redistribution without a final assignment; confirm changes with the team.
- Root capability table is **[Proposed]**. Do not infer additional admin powers from it.

## Service boundary and implementation status

_Origin: Team / Restated from root AGENTS.md; AI doc (implementation status)_

- **[Decided]** Order manages order creation, reading, permitted edits, assignment, lifecycle and history.
- **[Decided]** Every service owns its database; no cross-service database access or foreign keys.
- **[Decided]** TypeScript/Node.js, strict Zod validation and ORM/parameterized database access. Keep core code in `order-service/`.
- **[Decided]** Database access uses `pg` with parameterized SQL; schema changes use numbered SQL migrations and an Order-local runner tracking applied files, following User Service. Confirmed by the user on 2026-10-13. Migrations run in an approved one-shot Compose task after database health; HTTP framework remains open.
- **[Decided]** PostgreSQL for Order; confirmed by the user on 2026-10-12. Root's earlier proposed status predates this confirmation.
- **[Decided]** Save pickup details as a snapshot and require a whole-number credit offer of at least 1; confirmed in chat on 2026-10-12.
- **[Decided]** Delivery also uses a Supplier location ID and a name/coordinate snapshot, matching pickup; confirmed by the user on 2026-10-13. Name and coordinates are sufficient for both snapshots; no address/building/floor fields required, confirmed on 2026-10-13.
- **[Decided]** Core schema details approved on 2026-10-13: latitude NUMERIC(11,9), longitude NUMERIC(12,9); database-generated UUIDs for orders/history/confirmations and creation timestamps; initial PENDING and version 1 with positive-version constraint; omitted window starts at creation and ends 24 hours later.
- **[Decided]** Assignment constraints: PENDING requires null courier; ACCEPTED, PICKED_UP, IN_PROGRESS, ARRIVED and COMPLETED require courier; CANCELLED permits null or assigned courier. Assigned courier must differ from requester. Concurrency approved on 2026-10-13: loaded version required for edits and lifecycle actions; reject mismatches and increment version on every successful order change.
- **[Decided]** Query indexes approved on 2026-10-13: orders(status, created_at), orders(requester_id, created_at), orders(courier_id, created_at), partial orders(window_end) for PENDING/ACCEPTED/PICKED_UP/IN_PROGRESS, order_history(order_id, occurred_at), order_confirmations(order_id, status). Previously approved unique indexes remain in force.
- **[Decided]** Confirmation row constraints approved on 2026-10-13: allowed kinds TIMING_CHANGE/CANCELLATION/COMPLETION, responses PENDING/ACCEPTED/REJECTED, states PENDING/APPROVED/REJECTED/EXPIRED/SUPERSEDED. Timing-change proposals require both timing fields with end after start; other kinds require both null. resolved_at is null for PENDING and required for resolved states. APPROVED requires both ACCEPTED; either rejection resolves as REJECTED. Participant/state/expiry checks remain service transaction logic.
- **[Decided]** Database-only implementation plan approved on 2026-10-13: numbered SQL migration, standalone TypeScript/pg CLI, PostgreSQL Compose database with persistent volume, one-shot migration task and isolated PostgreSQL tests.
- **[Decided]** NestJS HTTP server, per the team-consolidated `order-service-plan.md` (2026-10-14). Endpoint list is in that plan §3; response shapes (see README) are **[Proposed]**.
- Implemented database foundation: `migrations/001_init.sql`, connection configuration, migration CLI/runner, Docker/Compose and PostgreSQL integration tests.
- Implemented Phase A: JWKS token verification, Zod validation, error envelope, request/denial logging, and the read endpoints `GET /orders/available|mine|assigned|:orderId|:orderId/history`.
- Implemented Phase B: `POST /orders`, `PATCH /orders/:orderId`, `POST /orders/:orderId/accept`, with Supplier location checks over HTTP, Credit reserve/release and the credit clean-up job; `AWAITING_CREDIT`, `CREDIT_RESERVED` and `credit_released_at` (renamed `credit_settled_at` in Phase D) added to `001_init.sql`.
- Implemented Phase C: `POST /orders/:orderId/pick-up|start-delivery|arrive|cancel` and `GET|POST /orders/:orderId/confirmations`, `POST /orders/:orderId/confirmations/:confirmationId/respond`. No events, expiry worker or suspension/deactivation handling yet (Phase D).
- Implemented Phase D step 1: the 10 s settlement job (`settleCredits`) sends Credit's `TransferCredits` for `COMPLETED` and `ReleaseCredits` for `CANCELLED` orders to `credit.commands`, marking `credit_settled_at` once Kafka stores the command. HTTP release is gone; reserve stays on HTTP. Not yet: `order.events`, suspension/deactivation, the internal active-order lookup.
- Implemented Phase D step 2: the 60 s expiry worker (`expireOrders`) cancels `PENDING`/`ACCEPTED`/`PICKED_UP`/`IN_PROGRESS` orders once `now() >= window_end` (plan §0/§2), rechecking each under its row lock; history `reason: EXPIRED`, no actor; pending `TIMING_CHANGE` → `EXPIRED`, pending `CANCELLATION` → `SUPERSEDED` (plan §2 rule 6). No `OrderCancelled` yet (needs `order.events`).
- Implemented Phase D step 3: `order.events` (contract below), published every second from `order_history` as the outbox, so expiry, requester and mutual cancellations now publish `OrderCancelled`; and `GET /internal/orders/users/:userId/active` behind `ORDER_SERVICE_KEY`. Not yet, blocked on other services: `UserSuspended` / `SupplierDeactivated` consumers (User and Supplier publish nothing yet); the User Service calling the lookup before deactivation.

## Creation and reading [Decided]

_Origin: Team (OSFR1.1–OSFR1.2); Restated from root identity and credit rules_

- **[Decided]** Interpret item description(s) as one free-text `order_description` on the order, confirmed by the user on 2026-10-12. It captures task details and special instructions; no separate item table or delivery-description field.
- Requester inputs: pickup point, drop-off point, item description(s), timing window and credit offer (O1.1.1). Credits are whole numbers.
- Generate order identifier and timestamp in the system (O1.1.2). Requester identity comes only from verified authentication, never body fields (O1.1.3 and root §8).
- **[Decided]** Default timing window when omitted is 24 hours from creation (O1.1.4), confirmed on 2026-10-13; exact validation limits and expiry boundary remain open.
- **[Decided]** Both pickup and delivery Supplier locations must be ACTIVE when creating an order, confirmed on 2026-10-13. Supplier provides authoritative status/snapshot information. The user asked about direct checks; transport is not approved and must be reconciled with the existing query-event decision. Later location deactivation effects remain open.
- Reject missing required inputs (O1.1.5). Successful new orders start `PENDING` and appear among available orders (O1.1.6–7).
- Ensure sufficient credits before creation and reserve the offer under the approved Credit contract (O1.1.8, root §1/§3).
- Couriers can read available `PENDING` orders and their assigned orders. Requesters can read their own orders (O1.2.1–3).

## Editing and timing-window acknowledgement [Decided]

_Origin: Team (OSFR1.3)_

- Only the requester may edit pickup/drop-off points, item descriptions and timing window while `PENDING`, subject to the timing rules below (O1.3.1).
- Reject edits to other fields, including system identifiers and credit offer; apply creation validation to edits (O1.3.2–4).
- Timing-window updates are permitted in `PENDING`, `ACCEPTED`, `PICKED_UP` and `IN_PROGRESS` (O1.3.5).
- In `ACCEPTED`, `PICKED_UP` and `IN_PROGRESS`, reject all non-timing edits (O1.3.6).
- Apply timing changes only after both parties acknowledge. Rejection by either party or closure of the current window prevents the change (O1.3.7–8).
- Reject all updates in `COMPLETED` or `CANCELLED` (O1.3.9).
- **[Decided]** Confirmation initiation, approved on 2026-10-13: after acceptance, requester or assigned courier may initiate timing-change proposals (changed from requester-only by Zi Yi on 2026-10-16; tell the team), mutual cancellation or completion (completion only in ARRIVED). Initiation counts as initiator ACCEPTED, with other party PENDING; both approvals are required before the order change. Chat messages do not count as confirmations.
- **[Decided]** Timing-change proposals expire when current time >= the existing window_end, with no shorter deadline; approved on 2026-10-13. Leave the current window unchanged, reject later approval and retain the expired proposal. Proposed new timing does not extend its own approval deadline.
- **[Decided]** Cancellation/completion proposals have no independent expiry timer; approved on 2026-10-13. Pending until approved, rejected or invalidated when the order becomes terminal through another action; reject approvals after COMPLETED/CANCELLED. Order timeout rules remain unchanged (ARRIVED excluded).
- **[Decided]** At most one PENDING proposal per order across all kinds, approved on 2026-10-13. Reject new proposals until the existing one resolves; do not replace automatically. Enforce with a partial unique index on order_id WHERE status = PENDING; applying approval rechecks current order state/version.
- **[Decided]** Terminal-action proposal invalidation approved on 2026-10-13: pending proposals invalidated by another terminal action become SUPERSEDED with resolved_at in the same transaction as the order change/history; reject later responses. A proposal causing terminal transition is APPROVED; timing deadline expiry is EXPIRED.
- **[Decided]** No edits in `ARRIVED`, confirmed by the user on 2026-10-13. Required completion/cancellation confirmations are separate lifecycle actions.
- User directed confirmations to follow the FRs on 2026-10-13 and subsequently approved initiators/initial approval. PENDING timing edits were subsequently approved as requester-only; timing-change expiry was subsequently approved at the existing window end; cancellation/completion lifetime was subsequently approved with no independent timer and terminal-order invalidation; one pending proposal per order was subsequently approved; SUPERSEDED for terminal-action invalidation was subsequently approved.

## Acceptance and lifecycle [Decided]

_Origin: Team (OSFR2, OSFR3, OSFR5)_

- Only `PENDING` orders can be accepted. Record the accepting courier and change to `ACCEPTED` (O2.1.1–2).
- Reject self-acceptance, acceptance of an already assigned order, and acceptance by a courier with another `ACCEPTED`, `PICKED_UP`, `IN_PROGRESS` or `ARRIVED` order (O2.2.1, O2.3.1, O2.4.1).
- **[Decided]** At most one courier accepts an order, including concurrent attempts (OSFR2.3): atomically update only if still PENDING and unassigned, approved on 2026-10-13.
- **[Decided]** Partial unique index on courier_id for ACCEPTED, PICKED_UP, IN_PROGRESS and ARRIVED enforces one active assignment, approved on 2026-10-13. COMPLETED/CANCELLED orders do not occupy the slot.

| Transition | Required actor/condition | Source |
|---|---|---|
| `PENDING → ACCEPTED` | Accepting courier; acceptance checks above | OSFR5.1 |
| `ACCEPTED → PICKED_UP` | Assigned courier has received the item | O3.1.1, OSFR5.3 |
| `PICKED_UP → IN_PROGRESS` | Assigned courier leaves pickup | O3.1.2, OSFR5.5 |
| `IN_PROGRESS → ARRIVED` | Assigned courier reaches drop-off | O3.1.3, OSFR5.7 |
| `ARRIVED → COMPLETED` | Both requester and assigned courier confirm/acknowledge | OSFR5.9 |

- `COMPLETED` and `CANCELLED` are terminal; prevent further state changes (OSFR5.11).
- Requester/courier are user modes, not authorization roles. Enforce ownership/assignment on the backend regardless of UI mode (root §5).
- **[Open]** Requester active-order limits: the meeting was inconclusive; supplied OSFR2.4 specifies a courier limit only.

## Cancellation [Decided]

_Origin: Team (OSFR1.4, OSFR5 cancellation rules); Restated from root credit rules_

- A requester can cancel their own `PENDING` order (O1.4.1, O5.2.1).
- `ACCEPTED`, `PICKED_UP`, `IN_PROGRESS` and `ARRIVED` require confirmation from both requester and assigned courier; unilateral cancellation is prohibited (O1.4.2–3, O5.4.2, O5.6.2, O5.8.2, OSFR5.10).
- Auto-cancel expired `PENDING`, `ACCEPTED`, `PICKED_UP` and `IN_PROGRESS` orders (O1.4.4, O5.2.2, O5.4.1, O5.6.1, O5.8.1). The supplied timeout rule does not list `ARRIVED`.
- Change to `CANCELLED` only for the documented requester, mutual-confirmation or timeout conditions (O1.4.5). Release the reserved offer on cancellation (root §1).
- **[Open]** Exact expiry boundary, scheduler behaviour and races between expiry, acceptance, acknowledgement and completion.

## History and events

_Origin: Team (OSFR4–OSFR6); Restated from root communication decisions_

- **[Decided]** List requester/courier past histories and track lifecycle timestamps for all seven states (OSFR4.1–2).
- **[Decided]** Write local changes and audit/history records in one transaction (root §8). History storage approved on 2026-10-13: order_history with UUID id/order FK, nullable actor UUID for system actions, action, nullable previous/new states, optional JSONB change_details and occurred_at. Approved actions: CREATED, CREDIT_RESERVED (added 2026-10-15 with `AWAITING_CREDIT`), EDITED, ACCEPTED, PICKED_UP, IN_PROGRESS, ARRIVED, COMPLETED, CANCELLED. Edits record old/new changed fields (including snapshots, description and timing); cancellation details distinguish requester, mutual and timeout. History supplies lifecycle timestamps.
- **[Decided]** Publish `OrderAccepted`, `OrderPickedUp`, `OrderInProgress`, `OrderArrived`, `OrderCompleted` and `OrderCancelled` after successful corresponding state changes (OSFR6.2–7).
- Supplied O6.1.1 requires event identifier, type, order identifier, requester identifier, courier identifier and event timestamp in a standardized schema. Field names, types and handling of unassigned courier are **[Open]**. → Decided by Zi Yi on 2026-10-18 (contract below; unassigned courier is null).
- Root §10 flags explicit new state as an **[Open]** payload addition. The supplied backlog already includes event identifier; reconcile that stale root reminder with the team rather than silently editing the contract. → Zi Yi added `data.status` on 2026-10-18 (contract below); the backlog wording is still the team's to change.
- **[Decided]** Publish status events to a broker; Notification is the only consumer under current root decisions. Order does not wait for Notification.
- **[Open]** Broker, publication/recovery mechanism and ordering contract. `OrderCreated` and additional consumers remain for discussion, not approved behaviour (root §10). → Broker, recovery and ordering decided by Zi Yi on 2026-10-18 (below); `OrderCreated` still for discussion.
- **[Decided by Zi Yi, 2026-10-18; confirm with team and the Notification owner]** `order.events` contract (Order owns the topic, root §3 Messaging rule 3): the plan §5 envelope plus `data.status`, keyed by `orderId`. `order_history` is the outbox: `published_at` (in `001_init.sql`) is set once Kafka stores the entry's event, so a state change and its event are saved in one transaction and a crash resends with the same `eventId` (the history entry's ID). Published every second, oldest first, stopping at the first failure so one order's events stay in order. Changes plan §9's "no transactional outbox for Kafka events" deferral.

  ```json
  { "eventId": "<history id>", "eventType": "OrderCancelled", "occurredAt": "2026-10-18T04:00:00.000Z",
    "data": { "orderId": "<uuid>", "requesterId": "<uuid>", "courierId": "<uuid> | null",
              "status": "CANCELLED", "reason": "EXPIRED" } }
  ```

  | History action | `eventType` |
  |---|---|
  | `ACCEPTED` | `OrderAccepted` |
  | `PICKED_UP` | `OrderPickedUp` |
  | `IN_PROGRESS` | `OrderInProgress` |
  | `ARRIVED` | `OrderArrived` |
  | `COMPLETED` | `OrderCompleted` |
  | `CANCELLED` (not from `AWAITING_CREDIT`) | `OrderCancelled`, `reason` `REQUESTER_CANCELLED`, `MUTUAL_CANCELLATION` or `EXPIRED` |

  `reason` appears only on `OrderCancelled`. `courierId` is null for an order cancelled before acceptance. Nothing is published for `CREATED`, `CREDIT_RESERVED`, `EDITED` or a create cancelled for credit. Consumers dedupe on `eventId` (root §7). Delivery is at least once.

## Integration and cross-cutting rules

_Origin: Team / Restated from root §3, §6 and §8; AI doc (conflict reminders)_

- **[Decided]** Gateway authenticates frontend traffic; Order authorizes its actions. Identity must come from verified authentication.
- **[Open]** Order identity propagation/re-verification contract. Do not copy Supplier's service-specific auth decisions into Order without approval.
- **[Decided by Zi Yi, 2026-10-18; confirm with the User Service owners]** `GET /internal/orders/users/:userId/active` (plan §4) needs `X-Service-Key` equal to `ORDER_SERVICE_KEY` (≥ 32 characters, as for Credit) instead of a user token; the gateway never routes `/internal/**`. Returns 200 `{ "userId": "<uuid>", "hasActiveOrders": true | false }`: true if the user is requester or courier on any order not `COMPLETED`/`CANCELLED` (including `AWAITING_CREDIT` and `ARRIVED`). 401 `SERVICE_KEY_INVALID` for a missing or wrong key; 400 for a non-UUID. The User Service refuses deactivation while true; it owns that rule.
- **[Decided]** Order → Credit reserve uses synchronous HTTP under root §3; transfer on completion and release on cancellation are `credit.commands` messages (root §3, changed by Zi Yi on 2026-10-17). [#53](https://github.com/AY2627S1-CS3219-P3/GrabFoc/issues/53) and the meeting propose asynchronous reservation; that still conflicts with the recorded decision and needs explicit team confirmation.
- **[Conflict]** `docs/order-service-plan.md` (team-consolidated 2026-10-14) uses direct HTTP `GET /locations/:id` for location checks, which Phase B implements; the line below and root §3 still record query events. Reconcile with the team.
- **[Decided]** Order publishes Supplier queries, Supplier alone consumes them; queries carry timestamps, stale queries may be rejected, and Order waits with loading/timeout behaviour. **[Open]** Response route, payload, correlation and timeout duration; read `supplier-service/AGENTS.md` before integration.
- **[Decided by Zi Yi, 2026-10-15; confirm with team]** Creation flow, replacing the earlier insert-reserve-commit decision (`docs/order-service-plan.md` §4): save as `AWAITING_CREDIT` with `CREATED` history; call reserve outside any transaction; on success move to `PENDING` with `CREDIT_RESERVED` history; on refusal, failure or timeout move to `CANCELLED` (system, `reason: CREDIT_NOT_RESERVED`) and call release. A 10-second job cancels `AWAITING_CREDIT` orders older than 30 s and retries release for `CANCELLED` orders without `credit_released_at`. Failed creates must not publish `OrderCancelled` (Notification would email about an order the requester never saw); their release is a `ReleaseCredits` command, which Notification never sees.
- **Credit owner to handle** (recorded in `credit-service/AGENTS.md` open items): a `ReleaseCredits` for an order Credit has no hold for (a reserve that timed out before Credit saved anything) is dead-lettered as `HOLD_NOT_FOUND`; and a reserve still running inside Credit can land after that release and stay held. One fix covers both: Credit records a release for an unknown order (a `RELEASED` marker) instead of failing.
- **[Decided by Zi Yi, 2026-10-17, replacing the 2026-10-15 events decision; confirm with team]** Reserve over HTTP. Transfer and release are Credit's commands on `credit.commands` (`TransferCredits`, `ReleaseCredits`; Credit owns their shape, `credit-service/AGENTS.md` "Messaging"), keyed by `orderId`. `order.events` is only for Notification (and later consumers). The `orders` table is the outbox: the settlement job sends a command for every `COMPLETED`/`CANCELLED` order without `credit_settled_at` and sets it once Kafka stores the command, so a crash resends it (Credit ignores repeats). A failed create with `INSUFFICIENT_CREDITS` is marked settled straight away, since Credit kept nothing. Root §3's Communication bullet now records this.
- **[Decided by Zi Yi, 2026-10-15]** Before the Phase D expiry worker, an order past `window_end` in `PENDING`/`ACCEPTED`/`PICKED_UP`/`IN_PROGRESS` refuses lifecycle steps and `TIMING_CHANGE` proposals or approvals (expiry wins, plan §6). Requester cancellation of `PENDING` and `CANCELLATION` proposals and approvals stay allowed, so nothing is stuck before the worker exists.
- **[Proposed]** `arrive` marks a pending `TIMING_CHANGE` `SUPERSEDED` in the same transaction, since `ARRIVED` allows no timing changes and the pending proposal would otherwise block `COMPLETION`. This extends SUPERSEDED beyond terminal actions; confirm with the team.
- Reject unknown body fields using strict Zod schemas. Never accept caller identity, role or ownership from body fields.
- Log 401/403 attempts consistently; never log credentials, tokens, OTPs, handover codes, balances or unmasked personal data.
- Document every read environment variable in `.env.example`; use safe placeholders and keep secrets out of Git.
- Follow the service-local Compose/root include layout and persist database data in Docker volumes.

## Verification and change workflow

_Origin: AI doc (checks derived from supplied requirements); Restated from root plan-first, testing and attribution rules_

- Before implementation, obtain the team designs and approved plan for schema, authorization, credit and inter-service changes. List affected files, steps, tests and unresolved inputs.
- Verify missing/unknown fields, generated fields, default timing, ownership, immutable fields and state-dependent edits.
- Verify self/duplicate/concurrent acceptance and the one-active-order courier limit.
- Verify each permitted transition, rejected transitions and terminal-state immutability.
- Verify mutual cancellation/completion, timing acknowledgement rejection/expiry and timeout cancellation using the approved details.
- Verify history, lifecycle timestamps and successful-state event publication, plus the approved credit failure/retry behaviour.
- Database tests use PostgreSQL 17 in Docker through `compose.test.yaml`, a separate project with temporary storage; database and plan approvals are recorded above.
- Add disclosure headers to AI-influenced files and exact prompts/key responses to your own log under [`ai/usage-log/`](../ai/usage-log.md). Human review is required before merge.
