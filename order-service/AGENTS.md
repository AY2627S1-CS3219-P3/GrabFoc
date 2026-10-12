<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-11
Scope: Restated Order requirements and recorded user-confirmed database, snapshot, credit minimum and description decisions.
Author review: User requested this document; content pending team review.
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
- **[Decided]** PostgreSQL for Order; confirmed by the user on 2026-10-12. Root's earlier proposed status predates this confirmation.
- **[Decided]** Save pickup details as a snapshot and require a whole-number credit offer of at least 1; confirmed in chat on 2026-10-12.
- **[Open]** Final schema/index approval, migrations, framework and Order HTTP contracts. [README.md](README.md) contains a proposed schema for review, not an approved migration.
- At document creation, this folder contains template `Dockerfile`/`README.md` and this agent context; do not assume APIs or migrations exist.

## Creation and reading [Decided]

_Origin: Team (OSFR1.1–OSFR1.2); Restated from root identity and credit rules_

- **[Decided]** Interpret item description(s) as one free-text `order_description` on the order, confirmed by the user on 2026-10-12. It captures task details and special instructions; no separate item table or delivery-description field.
- Requester inputs: pickup point, drop-off point, item description(s), timing window and credit offer (O1.1.1). Credits are whole numbers.
- Generate order identifier and timestamp in the system (O1.1.2). Requester identity comes only from verified authentication, never body fields (O1.1.3 and root §8).
- Use a default timing window when omitted (O1.1.4); **[Open]** the default value and exact validation limits.
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
- **[Open]** How acknowledgement applies to `PENDING` when no courier exists; who may initiate/acknowledge a proposal; proposal expiry and concurrent proposal behaviour.
- **[Open]** Editing in `ARRIVED` is not explicitly resolved by OSFR1.3; do not invent a rule.

## Acceptance and lifecycle [Decided]

_Origin: Team (OSFR2, OSFR3, OSFR5)_

- Only `PENDING` orders can be accepted. Record the accepting courier and change to `ACCEPTED` (O2.1.1–2).
- Reject self-acceptance, acceptance of an already assigned order, and acceptance by a courier with another `ACCEPTED`, `PICKED_UP`, `IN_PROGRESS` or `ARRIVED` order (O2.2.1, O2.3.1, O2.4.1).
- At most one courier accepts an order, including concurrent attempts (OSFR2.3). The enforcement mechanism is **[Open]**.

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
- **[Decided]** Write local changes and audit/history records in one transaction (root §8). History storage is **[Open]**.
- **[Decided]** Publish `OrderAccepted`, `OrderPickedUp`, `OrderInProgress`, `OrderArrived`, `OrderCompleted` and `OrderCancelled` after successful corresponding state changes (OSFR6.2–7).
- Supplied O6.1.1 requires event identifier, type, order identifier, requester identifier, courier identifier and event timestamp in a standardized schema. Field names, types and handling of unassigned courier are **[Open]**.
- Root §10 flags explicit new state as an **[Open]** payload addition. The supplied backlog already includes event identifier; reconcile that stale root reminder with the team rather than silently editing the contract.
- **[Decided]** Publish status events to a broker; Notification is the only consumer under current root decisions. Order does not wait for Notification.
- **[Open]** Broker, publication/recovery mechanism and ordering contract. `OrderCreated` and additional consumers remain for discussion, not approved behaviour (root §10).

## Integration and cross-cutting rules

_Origin: Team / Restated from root §3, §6 and §8; AI doc (conflict reminders)_

- **[Decided]** Gateway authenticates frontend traffic; Order authorizes its actions. Identity must come from verified authentication.
- **[Open]** Order identity propagation/re-verification contract. Do not copy Supplier's service-specific auth decisions into Order without approval.
- **[Decided]** Order → Credit reserve/transfer/release uses synchronous HTTP under root §3. Transfer on completion, release on cancellation. [#53](https://github.com/AY2627S1-CS3219-P3/GrabFoc/issues/53) and the meeting propose asynchronous reservation; this conflicts with the recorded decision and needs explicit team confirmation.
- **[Decided]** Order publishes Supplier queries, Supplier alone consumes them; queries carry timestamps, stale queries may be rejected, and Order waits with loading/timeout behaviour. **[Open]** Response route, payload, correlation and timeout duration; read `supplier-service/AGENTS.md` before integration.
- **[Open]** Recovery for reserved credits with failed order creation and completed orders with unavailable transfer. The meeting deferred these questions; do not select retries, compensation or another pattern silently.
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
- Root testing decision uses PostgreSQL in Docker for database tests; resolve Order's proposed database choice before adding service-specific configuration.
- Add disclosure headers to AI-influenced files and exact prompts/key responses to [the shared usage log](../ai/usage-log.md). Human review is required before merge.
