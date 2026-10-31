<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
Scope: Moved root AGENTS.md §7 here unchanged (sections "Who gets emailed" to "Edge cases"); wrote "Status" and "Open design items" from issues #147–#155 (#149).
Author review: pending — Jie Yang to record the review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
Scope: Wrote "Design decisions (#148)" from the decisions Jie Yang gave in chat.
Author review: pending — Jie Yang to record the review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
Scope: Updated "Status" for the schema and consumer (#150, #152).
Author review: pending — Jie Yang to record the review.
-->

# AGENTS.md — Notification Service

Read the root `AGENTS.md` first; this file holds only what is specific to Notification.

## Status

_Origin: AI doc_

- Scaffold (#149): NestJS on port 3006, its own PostgreSQL (`notification-db`, host port 5436), and `GET /health`.
- Schema (#150) and `order.events` consumer (#152): each event is deduplicated, checked for staleness and given one `PENDING` row in `notifications` per recipient, in one transaction. Unreadable events go to `notification.order-events.dlt` and are copied into `notification_dead_letters`.
- Not yet: sending emails (#153, which needs the User endpoint #151), retry topics and the admin dead-letter endpoints (#154), end-to-end and CI (#155). Tracking issue: #147.

## Purpose

_Origin: Team (Backlog NTFR1–3, NFR3.4)_

- Email only. Consumes order-state events and emails the right party. Stores almost nothing.

## Who gets emailed [Decided]

_Origin: Team (Backlog NTFR2)_

| New state | Recipient |
|---|---|
| `ACCEPTED`, `PICKED_UP`, `IN_PROGRESS` | requester |
| `ARRIVED` | requester |
| `COMPLETED` | requester and courier |
| `CANCELLED` | requester, plus the courier if one was assigned |
| any other state | recorded and discarded |

## Rules

_Origin: Team (Backlog NTFR1, NFR3.4)_

- Deduplicate on the event ID: send at most one email per event.
- Keep the last processed state per order and discard stale events. State order: `PENDING < ACCEPTED < PICKED_UP < IN_PROGRESS < ARRIVED < COMPLETED/CANCELLED`.
- Mark an event handled only after its send outcome is saved. After a restart, resume from the last handled event.
- **[Proposed]** Retry with exponential backoff?
- **[Decided]** (Backlog NFR3.4) Target: 95% of emails handed to the mail provider within 10 s of the event.
- **[Decided]** (Jie Yang, 2026-10-27) The recipient's email comes from a User Service endpoint, called when sending (#151). `order.events` and `user.events` carry no email addresses.

## Edge cases

_Origin: Team_

- Order events arrive out of order → no emails sent out of sequence.

## Design decisions (#148)

_Origin: Team (Jie Yang, 2026-10-30, after going through Claude Code's draft schema table by table). Full SQL in #148._

- **[Decided]** Tables: `notification_events` (one row per event; the insert deduplicates), `notification_order_states` (last state handled per order), `notifications` (one row per recipient per event, with the send result), `notification_dead_letters` (Credit's `credit_dead_letters` columns). No email address or rendered body is stored.
- **[Decided]** Email templates live in code, not in a table.
- **[Decided]** The cancellation `reason` is stored on the event; the CANCELLED email shows it.
- **[Decided]** Stale check: discard an event only when its state is earlier than the last one handled. A repeat of the same state is not discarded.
- **[Decided]** `COMPLETED` and `CANCELLED` block every later event for that order, including the other final state. Compare states by an explicit rank (both final states rank 6), never by enum order.
- **[Decided]** Retries work like Credit's: `notification.order-events.retry.<n>`, one topic per delay in `NOTIFICATION_RETRY_DELAYS`, then `notification.order-events.dlt` (root §3 Messaging rules 4 and 6).
- **[Decided]** Dead letters are also copied into `notification_dead_letters`, by consuming `notification.order-events.dlt`. Admins list them with `GET /dead-letters` and replay one with `POST /dead-letters/:eventId/replay`; both are ADMIN only, like Credit's.

## Open design items

- **[Open]** The User endpoint's shape, owned by the User Service (#151).
